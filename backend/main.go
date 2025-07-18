package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/crypto/bcrypt"
)

// --- CONFIGURATION ---
var DB_FILE = "leads.db"
var JWT_SECRET = []byte("a_very_secret_key_that_should_be_in_env_var") // In production, use environment variables!
const SCRAPER_COMMAND = "google-maps-scraper"

// --- DATABASE SETUP ---
var db *sql.DB

func initDB() {
	var err error
	db, err = sql.Open("sqlite3", DB_FILE)
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}

	_, err = db.Exec("PRAGMA journal_mode=WAL;")
	if err != nil {
		log.Fatal("Failed to set WAL mode:", err)
	}

	createTables()
}

func createTables() {
	_, err := db.Exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        );
    `)
	if err != nil {
		log.Fatal("Failed to create users table:", err)
	}

	_, err = db.Exec(`
        CREATE TABLE IF NOT EXISTS searches (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            keyword TEXT NOT NULL,
            status TEXT NOT NULL,
            leads_found INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );
    `)
	if err != nil {
		log.Fatal("Failed to create searches table:", err)
	}

	_, err = db.Exec(`
        CREATE TABLE IF NOT EXISTS leads (
            id TEXT PRIMARY KEY,
            search_id TEXT NOT NULL,
            company_name TEXT,
            phone TEXT,
            website TEXT,
            email TEXT,
            page_speed INTEGER,
            scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (search_id) REFERENCES searches (id)
        );
    `)
	if err != nil {
		log.Fatal("Failed to create leads table:", err)
	}

	_, err = db.Exec(`
        CREATE TABLE IF NOT EXISTS crm_leads (
            user_id INTEGER NOT NULL,
            lead_id TEXT NOT NULL,
            column_id TEXT NOT NULL,
            notes TEXT,
            times_called INTEGER DEFAULT 0,
            callback_date DATETIME,
            company_name TEXT,
            phone TEXT,
            website TEXT,
            email TEXT,
            page_speed INTEGER,
            PRIMARY KEY (user_id, lead_id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        );
    `)
	if err != nil {
		log.Fatal("Failed to create crm_leads table:", err)
	}
}

// --- MODELS ---
type User struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	PasswordHash string `json:"-"`
}

type RegisterInput struct {
	Name     string `json:"name" binding:"required"`
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginInput struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type Search struct {
	ID         string    `json:"id"`
	UserID     int64     `json:"-"`
	Keyword    string    `json:"keyword"`
	Status     string    `json:"status"`
	LeadsFound int       `json:"leadsFound"`
	CreatedAt  time.Time `json:"date"`
}

type Lead struct {
	ID          string `json:"id"`
	SearchID    string `json:"searchId"`
	CompanyName string `json:"companyName"`
	Phone       string `json:"phone"`
	Website     string `json:"website"`
	Email       string `json:"email"`
	PageSpeed   int    `json:"pageSpeed"`
}

type ScrapedLead struct {
	Title   string   `json:"title"`
	Phone   string   `json:"phone"`
	Website string   `json:"web_site"`
	Emails  []string `json:"emails"`
}

type CrmLead struct {
	ID           string     `json:"id"`
	CompanyName  string     `json:"companyName"`
	Phone        string     `json:"phone"`
	Website      string     `json:"website"`
	Email        string     `json:"email"`
	PageSpeed    int        `json:"pageSpeed"`
	ColumnID     string     `json:"columnId"`
	Notes        string     `json:"notes"`
	TimesCalled  int        `json:"timesCalled"`
	CallBackDate *time.Time `json:"callBackDate"`
}

// --- AUTHENTICATION ---
func hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	return string(bytes), err
}

func checkPasswordHash(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func generateJWT(userID int64) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(time.Hour * 72).Unix(),
	})
	return token.SignedString(JWT_SECRET)
}

func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return JWT_SECRET, nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			return
		}

		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			userID, ok := claims["user_id"].(float64)
			if !ok {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid user ID in token"})
				return
			}
			c.Set("userID", int64(userID))
			c.Next()
		} else {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
		}
	}
}

// --- HANDLERS ---
func registerHandler(c *gin.Context) {
	var input RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hashedPassword, err := hashPassword(input.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	res, err := db.Exec("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)", input.Name, input.Email, hashedPassword)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			c.JSON(http.StatusConflict, gin.H{"error": "User with this email already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	userID, _ := res.LastInsertId()
	token, _ := generateJWT(userID)
	c.JSON(http.StatusCreated, gin.H{"token": token, "user": gin.H{"id": userID, "name": input.Name, "email": input.Email}})
}

func loginHandler(c *gin.Context) {
	var input LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user User
	err := db.QueryRow("SELECT id, name, email, password_hash FROM users WHERE email = ?", input.Email).Scan(&user.ID, &user.Name, &user.Email, &user.PasswordHash)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	if !checkPasswordHash(input.Password, user.PasswordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	token, _ := generateJWT(user.ID)
	c.JSON(http.StatusOK, gin.H{"token": token, "user": gin.H{"id": user.ID, "name": user.Name, "email": user.Email}})
}

func startSearchHandler(c *gin.Context) {
	userID, _ := c.Get("userID")
	var input struct {
		Keyword string `json:"keyword" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	searchID := uuid.New().String()
	newSearch := Search{
		ID:        searchID,
		UserID:    userID.(int64),
		Keyword:   input.Keyword,
		Status:    "In Progress",
		CreatedAt: time.Now(),
	}

	_, err := db.Exec("INSERT INTO searches (id, user_id, keyword, status) VALUES (?, ?, ?, ?)", newSearch.ID, newSearch.UserID, newSearch.Keyword, newSearch.Status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create search job", "details": err.Error()})
		return
	}

	go runScraper(newSearch)
	c.JSON(http.StatusAccepted, newSearch)
}

func getSearchesHandler(c *gin.Context) {
	userID, _ := c.Get("userID")
	rows, err := db.Query("SELECT id, keyword, status, leads_found, created_at FROM searches WHERE user_id = ? ORDER BY created_at DESC", userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve searches"})
		return
	}
	defer rows.Close()

	var searches []Search
	for rows.Next() {
		var s Search
		if err := rows.Scan(&s.ID, &s.Keyword, &s.Status, &s.LeadsFound, &s.CreatedAt); err != nil {
			log.Printf("Error scanning search row: %v", err)
			continue
		}
		searches = append(searches, s)
	}
	c.JSON(http.StatusOK, searches)
}

func getLeadsForSearchHandler(c *gin.Context) {
	userID, _ := c.Get("userID")
	searchID := c.Param("searchId")

	var ownerID int64
	err := db.QueryRow("SELECT user_id FROM searches WHERE id = ?", searchID).Scan(&ownerID)
	if err != nil || ownerID != userID.(int64) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	rows, err := db.Query("SELECT id, search_id, company_name, phone, website, email, page_speed FROM leads WHERE search_id = ?", searchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve leads"})
		return
	}
	defer rows.Close()

	var leads []Lead
	for rows.Next() {
		var l Lead
		var email, website, phone sql.NullString
		var pageSpeed sql.NullInt64
		if err := rows.Scan(&l.ID, &l.SearchID, &l.CompanyName, &phone, &website, &email, &pageSpeed); err != nil {
			log.Printf("Error scanning lead row: %v", err)
			continue
		}
		l.Email = email.String
		l.Website = website.String
		l.Phone = phone.String
		l.PageSpeed = int(pageSpeed.Int64)
		leads = append(leads, l)
	}
	c.JSON(http.StatusOK, leads)
}

func getCrmHandler(c *gin.Context) {
	userID, _ := c.Get("userID")
	rows, err := db.Query(`
        SELECT lead_id, company_name, phone, website, email, page_speed, column_id, notes, times_called, callback_date 
        FROM crm_leads 
        WHERE user_id = ?`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch CRM data", "details": err.Error()})
		return
	}
	defer rows.Close()

	crmLeads := make(map[string]CrmLead)
	columns := map[string][]string{"tobe-called": {}, "contacted": {}}

	for rows.Next() {
		var cl CrmLead
		var leadID, companyName, phone, website, email, columnID, notes sql.NullString
		var pageSpeed, timesCalled sql.NullInt64
		var callbackDate sql.NullTime

		err := rows.Scan(&leadID, &companyName, &phone, &website, &email, &pageSpeed, &columnID, &notes, &timesCalled, &callbackDate)
		if err != nil {
			log.Printf("Error scanning CRM lead: %v", err)
			continue
		}

		cl.ID = leadID.String
		cl.CompanyName = companyName.String
		cl.Phone = phone.String
		cl.Website = website.String
		cl.Email = email.String
		cl.PageSpeed = int(pageSpeed.Int64)
		cl.ColumnID = columnID.String
		cl.Notes = notes.String
		cl.TimesCalled = int(timesCalled.Int64)
		if callbackDate.Valid {
			cl.CallBackDate = &callbackDate.Time
		}

		crmLeads[cl.ID] = cl
		if _, ok := columns[cl.ColumnID]; ok {
			columns[cl.ColumnID] = append(columns[cl.ColumnID], cl.ID)
		}
	}

	if rows.Err() != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error during CRM data iteration", "details": rows.Err().Error()})
		return
	}

	response := gin.H{
		"leads":   crmLeads,
		"columns": gin.H{
			"tobe-called": gin.H{"id": "tobe-called", "title": "To Be Called", "leadIds": columns["tobe-called"]},
			"contacted":   gin.H{"id": "contacted", "title": "Contacted", "leadIds": columns["contacted"]},
		},
	}
	c.JSON(http.StatusOK, response)
}

func addLeadsToCrmHandler(c *gin.Context) {
	userID, _ := c.Get("userID")
	var leadsToAdd []Lead
	if err := c.ShouldBindJSON(&leadsToAdd); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	tx, err := db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
        INSERT OR IGNORE INTO crm_leads (user_id, lead_id, column_id, company_name, phone, website, email, page_speed)
        VALUES (?, ?, 'tobe-called', ?, ?, ?, ?, ?)
    `)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare statement"})
		return
	}
	defer stmt.Close()

	for _, lead := range leadsToAdd {
		_, err := stmt.Exec(userID, lead.ID, lead.CompanyName, lead.Phone, lead.Website, lead.Email, lead.PageSpeed)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add lead to CRM"})
			return
		}
	}

	tx.Commit()
	c.JSON(http.StatusOK, gin.H{"message": "Leads added to CRM successfully"})
}

func updateCrmStateHandler(c *gin.Context) {
	userID, _ := c.Get("userID")
	var input struct {
		LeadID      string `json:"leadId"`
		NewColumnID string `json:"newColumnId"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	_, err := db.Exec("UPDATE crm_leads SET column_id = ? WHERE user_id = ? AND lead_id = ?", input.NewColumnID, userID, input.LeadID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update CRM state"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "CRM state updated"})
}

func updateCrmLeadHandler(c *gin.Context) {
	userID, _ := c.Get("userID")
	leadID := c.Param("leadId")

	var updatedLead CrmLead
	if err := c.ShouldBindJSON(&updatedLead); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	_, err := db.Exec(`
        UPDATE crm_leads 
        SET notes = ?, times_called = ?, callback_date = ?
        WHERE user_id = ? AND lead_id = ?
    `, updatedLead.Notes, updatedLead.TimesCalled, updatedLead.CallBackDate, userID, leadID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update lead details", "details": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updatedLead)
}

// --- SCRAPER LOGIC ---
func runScraper(search Search) {
	log.Printf("Starting scraper for search ID %s, keyword: '%s'", search.ID, search.Keyword)
	tmpDir := os.TempDir()
	inputFile, err := os.Create(filepath.Join(tmpDir, fmt.Sprintf("input_%s.txt", search.ID)))
	if err != nil {
		log.Printf("Error creating temp input file for search %s: %v", search.ID, err)
		updateSearchStatus(search.ID, "Failed")
		return
	}
	defer os.Remove(inputFile.Name())

	outputFileName := filepath.Join(tmpDir, fmt.Sprintf("output_%s.json", search.ID))
	defer os.Remove(outputFileName)

	if _, err := inputFile.WriteString(search.Keyword); err != nil {
		log.Printf("Error writing to temp input file for search %s: %v", search.ID, err)
		inputFile.Close()
		updateSearchStatus(search.ID, "Failed")
		return
	}
	inputFile.Close()

	cmd := exec.Command(SCRAPER_COMMAND, "-input", inputFile.Name(), "-results", outputFileName, "-json", "-email")
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("Scraper command failed for search %s. Error: %v. Output: %s", search.ID, err, string(output))
		updateSearchStatus(search.ID, "Failed")
		return
	}

	log.Printf("Scraper finished for search ID %s.", search.ID)
	processScraperOutput(search.ID, outputFileName)
}

// *** FIXED SCRAPER PROCESSING FUNCTION ***
func processScraperOutput(searchID, outputFileName string) {
	file, err := os.Open(outputFileName)
	if err != nil {
		log.Printf("Error reading scraper output file %s: %v", outputFileName, err)
		updateSearchStatus(searchID, "Failed")
		return
	}
	defer file.Close()

	var scrapedLeads []ScrapedLead
	decoder := json.NewDecoder(file)
	for {
		var lead ScrapedLead
		if err := decoder.Decode(&lead); err == io.EOF {
			break
		} else if err != nil {
			log.Printf("Error decoding JSON object for search %s: %v", searchID, err)
			updateSearchStatus(searchID, "Failed")
			return
		}
		scrapedLeads = append(scrapedLeads, lead)
	}

	log.Printf("Found and decoded %d leads for search %s", len(scrapedLeads), searchID)

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		log.Printf("Failed to begin transaction for search %s: %v", searchID, err)
		updateSearchStatus(searchID, "Failed")
		return
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare("INSERT INTO leads (id, search_id, company_name, phone, website, email) VALUES (?, ?, ?, ?, ?, ?)")
	if err != nil {
		log.Printf("Failed to prepare statement for search %s: %v", searchID, err)
		updateSearchStatus(searchID, "Failed")
		return
	}
	defer stmt.Close()

	for _, sl := range scrapedLeads {
		leadID := uuid.New().String()
		email := ""
		if len(sl.Emails) > 0 {
			email = sl.Emails[0]
		}
		_, err := stmt.Exec(leadID, searchID, sl.Title, sl.Phone, sl.Website, email)
		if err != nil {
			// If any insert fails, log it, rollback the entire transaction, and mark the search as failed.
			log.Printf("Failed to insert lead, rolling back transaction for search %s: %v. Lead: %+v", searchID, err, sl)
			updateSearchStatus(searchID, "Failed")
			return // Exit the function immediately.
		}
	}

	// This code will only be reached if all inserts in the loop succeed.
	_, err = tx.Exec("UPDATE searches SET status = 'Completed', leads_found = ? WHERE id = ?", len(scrapedLeads), searchID)
	if err != nil {
		log.Printf("Failed to update search status for %s: %v", searchID, err)
		return
	}

	if err := tx.Commit(); err != nil {
		log.Printf("Failed to commit transaction for search %s: %v", searchID, err)
		updateSearchStatus(searchID, "Failed")
		return
	}

	log.Printf("Successfully processed and stored %d leads for search %s", len(scrapedLeads), searchID)
}

func updateSearchStatus(searchID, status string) {
	_, err := db.Exec("UPDATE searches SET status = ? WHERE id = ?", status, searchID)
	if err != nil {
		log.Printf("Failed to update search status to '%s' for search ID %s: %v", status, searchID, err)
	}
}

// --- MAIN ---
func main() {
	if _, err := exec.LookPath(SCRAPER_COMMAND); err != nil {
		log.Fatalf("'%s' command not found. Please install gosom/google-maps-scraper and ensure it's in your PATH.", SCRAPER_COMMAND)
	}

	initDB()
	defer db.Close()

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	r.POST("/register", registerHandler)
	r.POST("/login", loginHandler)

	api := r.Group("/api")
	api.Use(authMiddleware())
	{
		api.POST("/searches", startSearchHandler)
		api.GET("/searches", getSearchesHandler)
		api.GET("/leads/:searchId", getLeadsForSearchHandler)
		api.GET("/crm", getCrmHandler)
		api.POST("/crm/leads", addLeadsToCrmHandler)
		api.PUT("/crm/state", updateCrmStateHandler)
		api.PUT("/crm/leads/:leadId", updateCrmLeadHandler)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server starting on port %s", port)
	r.Run(":" + port)
}

