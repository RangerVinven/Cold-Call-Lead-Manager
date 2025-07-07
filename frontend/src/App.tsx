import React, { useState, createContext, useContext, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Calendar as CalendarIcon, ChevronDown, PlusCircle, Search, Star, Trash2, X, Phone, Mail, GripVertical, MoreHorizontal, Loader2 } from 'lucide-react';
import { format, addDays, isToday, parseISO } from 'date-fns';

// --- API CONFIGURATION ---
const API_BASE_URL = 'http://localhost:8080'; // Your Go backend URL

// --- API HELPER ---
// A centralized function to handle API requests, including adding the auth token.
const apiFetch = async (path, options = {}) => {
    const token = localStorage.getItem('authToken');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'An unknown error occurred' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    // For 204 No Content, etc.
    if (response.status === 204) {
        return null;
    }

    return response.json();
};


// --- AUTH CONTEXT ---
const AuthContext = createContext(null);

const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')));
    const [token, setToken] = useState(localStorage.getItem('authToken'));
    const [isAuthLoading, setIsAuthLoading] = useState(true);

    useEffect(() => {
        // This effect runs once on app load to check for existing token/user
        const storedToken = localStorage.getItem('authToken');
        const storedUser = localStorage.getItem('user');
        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
        }
        setIsAuthLoading(false);
    }, []);

    const login = async (email, password) => {
        const data = await apiFetch('/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        return true;
    };

    const register = async (name, email, password) => {
        const data = await apiFetch('/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, password }),
        });
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        return { success: true };
    };

    const logout = () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
    };

    const value = { user, token, login, logout, register, isAuthLoading };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const useAuth = () => useContext(AuthContext);

// --- UI COMPONENTS (SHADCN/UI inspired) ---
// These are simplified versions for brevity.

const Button = ({ children, variant = 'default', className = '', disabled, ...props }) => {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background';
  const variants = {
    default: 'bg-blue-600 text-white hover:bg-blue-600/90',
    destructive: 'bg-red-500 text-white hover:bg-red-500/90',
    outline: 'border border-input hover:bg-accent hover:text-accent-foreground',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-200/80',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'underline-offset-4 hover:underline text-primary',
  };
  return <button className={`${baseClasses} ${variants[variant]} ${className}`} disabled={disabled} {...props}>{disabled && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {children}</button>;
};

const Input = ({ className = '', ...props }) => (
  <input className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props} />
);

const Card = ({ children, className = '' }) => (
  <div className={`rounded-lg border bg-card text-card-foreground shadow-sm ${className}`}>{children}</div>
);

const CardHeader = ({ children, className = '' }) => <div className={`flex flex-col space-y-1.5 p-6 ${className}`}>{children}</div>;
const CardTitle = ({ children, className = '' }) => <h3 className={`text-2xl font-semibold leading-none tracking-tight ${className}`}>{children}</h3>;
const CardDescription = ({ children, className = '' }) => <p className={`text-sm text-muted-foreground ${className}`}>{children}</p>;
const CardContent = ({ children, className = '' }) => <div className={`p-6 pt-0 ${className}`}>{children}</div>;

const Table = ({ children, className = '' }) => <div className="w-full overflow-auto"><table className={`w-full caption-bottom text-sm ${className}`}>{children}</table></div>;
const TableHeader = ({ children, className = '' }) => <thead className={`[&_tr]:border-b ${className}`}>{children}</thead>;
const TableBody = ({ children, className = '' }) => <tbody className={`[&_tr:last-child]:border-0 ${className}`}>{children}</tbody>;
const TableRow = ({ children, className = '' }) => <tr className={`border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted ${className}`}>{children}</tr>;
const TableHead = ({ children, className = '' }) => <th className={`h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 ${className}`}>{children}</th>;
const TableCell = ({ children, className = '' }) => <td className={`p-4 align-middle [&:has([role=checkbox])]:pr-0 ${className}`}>{children}</td>;

const Checkbox = ({ className, ...props }) => (
  <input type="checkbox" className={`h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground ${className}`} {...props} />
);

const Dialog = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl m-4" onClick={e => e.stopPropagation()}>
        {children}
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={24} />
        </button>
      </div>
    </div>
  );
};
const DialogContent = ({ children, className='' }) => <div className={`p-6 ${className}`}>{children}</div>;
const DialogHeader = ({ children, className='' }) => <div className={`flex flex-col space-y-2 text-center sm:text-left ${className}`}>{children}</div>;
const DialogTitle = ({ children, className='' }) => <h2 className={`text-lg font-semibold ${className}`}>{children}</h2>;
const DialogDescription = ({ children, className='' }) => <p className={`text-sm text-muted-foreground ${className}`}>{children}</p>;
const DialogFooter = ({ children, className='' }) => <div className={`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-0 ${className}`}>{children}</div>;

const DropdownMenu = ({ trigger, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="relative inline-block text-left">
            <div>
                <button type="button" onClick={() => setIsOpen(!isOpen)} onBlur={() => setTimeout(() => setIsOpen(false), 150)} className="inline-flex justify-center w-full rounded-md border border-gray-300 shadow-sm px-2 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none">
                    {trigger}
                </button>
            </div>
            {isOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                    <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="menu-button">
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
};
const DropdownMenuItem = ({ children, onSelect }) => (
    <a href="#" onClick={(e) => { e.preventDefault(); onSelect(); }} className="text-gray-700 block px-4 py-2 text-sm hover:bg-gray-100" role="menuitem">{children}</a>
);

const FullPageLoader = () => (
    <div className="flex h-screen w-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
    </div>
);

// --- APP COMPONENTS ---

function PageSpeedBadge({ score }) {
  const getColor = () => {
    if (score >= 90) return 'bg-green-100 text-green-800';
    if (score >= 50) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };
  return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getColor()}`}>{score}</span>;
}

function Dashboard({ crmData }) {
  const { leads, columns } = crmData;
  const allLeads = Object.values(leads);

  const callsToday = allLeads.filter(lead => lead.callBackDate && isToday(parseISO(lead.callBackDate))).length;

  const statusData = [
    { name: 'To Be Called', value: columns['tobe-called'].leadIds.length },
    { name: 'Contacted', value: columns['contacted'].leadIds.length },
  ];
  const COLORS = ['#0088FE', '#00C49F'];

  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = addDays(new Date(), -i);
    return format(d, 'yyyy-MM-dd');
  }).reverse();

  // This logic would need to be adapted if history is stored on the backend
  const callsLast7Days = last7Days.map(day => ({ date: format(parseISO(day), 'MMM dd'), calls: 0 }));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total Leads in CRM</CardTitle>
            <CardDescription>All leads across all stages.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{allLeads.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Calls Scheduled Today</CardTitle>
            <CardDescription>Leads marked for callback today.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{callsToday}</p>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lead Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" labelLine={false} outerRadius={100} fill="#8884d8" dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Contacted Leads (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={callsLast7Days}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="calls" fill="#8884d8" name="Leads Contacted" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Searches({ onSelectSearch }) {
    const [searches, setSearches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [keyword, setKeyword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchSearches = useCallback(async () => {
        try {
            const data = await apiFetch('/api/searches');
            setSearches(data || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSearches();
        const interval = setInterval(fetchSearches, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, [fetchSearches]);

    const handleNewSearch = async () => {
        if (!keyword.trim()) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const newSearch = await apiFetch('/api/searches', {
                method: 'POST',
                body: JSON.stringify({ keyword }),
            });
            setSearches(prev => [newSearch, ...prev]);
            setKeyword('');
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) return <FullPageLoader />;
    if (error) return <div className="text-red-500">Error: {error}</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Searches</h1>
            </div>
            <div className="flex items-center space-x-2">
                <Input placeholder="Enter a keyword to start a new search (e.g., 'plumbers in london')" value={keyword} onChange={e => setKeyword(e.target.value)} disabled={isSubmitting} />
                <Button onClick={handleNewSearch} disabled={isSubmitting || !keyword.trim()}>
                    <Search className="mr-2 h-4 w-4" /> New Search
                </Button>
            </div>
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Keyword</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Leads Found</TableHead>
                                <TableHead>Date</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {searches.map(search => (
                                <TableRow key={search.id} className={search.status === 'Completed' ? "cursor-pointer" : "cursor-not-allowed opacity-70"} onClick={() => search.status === 'Completed' && onSelectSearch(search)}>
                                    <TableCell className="font-medium">{search.keyword}</TableCell>
                                    <TableCell>
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${search.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {search.status}
                                        </span>
                                    </TableCell>
                                    <TableCell>{search.leadsFound}</TableCell>
                                    <TableCell>{format(new Date(search.date), 'PPpp')}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

function LeadsView({ search, onBack }) {
    const [leads, setLeads] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedLeads, setSelectedLeads] = useState(new Set());

    useEffect(() => {
        const fetchLeads = async () => {
            setIsLoading(true);
            try {
                const data = await apiFetch(`/api/leads/${search.id}`);
                setLeads(data || []);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchLeads();
    }, [search.id]);

    const handleSelect = (leadId) => {
        setSelectedLeads(prev => {
            const newSet = new Set(prev);
            if (newSet.has(leadId)) newSet.delete(leadId);
            else newSet.add(leadId);
            return newSet;
        });
    };

    const handleSelectAll = (e) => {
        setSelectedLeads(e.target.checked ? new Set(leads.map(l => l.id)) : new Set());
    };

    const handleAddToCRM = async () => {
        const leadsToAdd = leads.filter(l => selectedLeads.has(l.id));
        try {
            await apiFetch('/api/crm/leads', {
                method: 'POST',
                body: JSON.stringify(leadsToAdd),
            });
            alert(`${leadsToAdd.length} leads added to CRM.`);
            setSelectedLeads(new Set());
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    };

    if (isLoading) return <FullPageLoader />;
    if (error) return <div className="text-red-500">Error: {error}</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <Button variant="link" onClick={onBack} className="p-0 h-auto mb-2">← Back to Searches</Button>
                    <h1 className="text-3xl font-bold">Leads for "{search.keyword}"</h1>
                </div>
                {selectedLeads.size > 0 && (
                    <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500">{selectedLeads.size} selected</span>
                        <Button onClick={handleAddToCRM}><PlusCircle className="mr-2 h-4 w-4" /> Add to CRM</Button>
                    </div>
                )}
            </div>
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]"><Checkbox onChange={handleSelectAll} checked={selectedLeads.size === leads.length && leads.length > 0} /></TableHead>
                                <TableHead>Company Name</TableHead>
                                <TableHead>Phone Number</TableHead>
                                <TableHead>Website</TableHead>
                                <TableHead>Email</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {leads.map(lead => (
                                <TableRow key={lead.id} data-state={selectedLeads.has(lead.id) ? 'selected' : ''}>
                                    <TableCell><Checkbox checked={selectedLeads.has(lead.id)} onChange={() => handleSelect(lead.id)} /></TableCell>
                                    <TableCell className="font-medium">{lead.companyName}</TableCell>
                                    <TableCell>{lead.phone}</TableCell>
                                    <TableCell><a href={`http://${lead.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{lead.website}</a></TableCell>
                                    <TableCell><a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">{lead.email}</a></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

function CRM() {
    const [crmData, setCrmData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [modalLead, setModalLead] = useState(null);

    const fetchCrmData = useCallback(async () => {
        try {
            const data = await apiFetch('/api/crm');
            setCrmData(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCrmData();
    }, [fetchCrmData]);

    const handleDrop = async (e, targetColumnId) => {
        const leadId = e.dataTransfer.getData("leadId");
        const sourceColumnId = e.dataTransfer.getData("sourceColumnId");
        if (sourceColumnId === targetColumnId) return;

        // Optimistic UI update
        const originalCrmData = { ...crmData };
        const leadToMove = crmData.leads[leadId];
        
        setCrmData(prev => {
            const newData = JSON.parse(JSON.stringify(prev));
            newData.columns[sourceColumnId].leadIds = newData.columns[sourceColumnId].leadIds.filter(id => id !== leadId);
            newData.columns[targetColumnId].leadIds.push(leadId);
            newData.leads[leadId].columnId = targetColumnId;
            return newData;
        });

        try {
            await apiFetch('/api/crm/state', {
                method: 'PUT',
                body: JSON.stringify({ leadId, newColumnId: targetColumnId }),
            });
        } catch (err) {
            alert(`Error updating lead: ${err.message}`);
            setCrmData(originalCrmData); // Revert on error
        }
    };

    const handleDragOver = (e) => e.preventDefault();

    const handleUpdateLead = async (updatedLead) => {
        const originalLead = crmData.leads[updatedLead.id];
        
        // Optimistic update
        setCrmData(prev => {
            const newData = { ...prev };
            newData.leads[updatedLead.id] = updatedLead;
            return newData;
        });

        try {
            await apiFetch(`/api/crm/leads/${updatedLead.id}`, {
                method: 'PUT',
                body: JSON.stringify(updatedLead),
            });
        } catch (err) {
            alert(`Error saving lead: ${err.message}`);
            setCrmData(prev => ({ ...prev, leads: { ...prev.leads, [updatedLead.id]: originalLead } }));
        }
    };

    if (isLoading) return <FullPageLoader />;
    if (error) return <div className="text-red-500">Error: {error}</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">CRM</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {Object.values(crmData.columns).map(column => (
                    <div key={column.id} className="bg-gray-100 rounded-lg p-4" onDrop={(e) => handleDrop(e, column.id)} onDragOver={handleDragOver}>
                        <h2 className="font-bold mb-4 text-lg">{column.title} ({column.leadIds.length})</h2>
                        <div className="space-y-4">
                            {column.leadIds.map(leadId => {
                                const lead = crmData.leads[leadId];
                                if (!lead) return null;
                                return (
                                <Card key={lead.id} className="bg-white cursor-pointer" draggable onDragStart={(e) => { e.dataTransfer.setData("leadId", lead.id); e.dataTransfer.setData("sourceColumnId", column.id); }} onClick={() => setModalLead(lead)}>
                                    <CardContent className="p-4 flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold">{lead.companyName}</p>
                                            {lead.callBackDate && <p className="text-sm text-red-600">Call back: {format(parseISO(lead.callBackDate), 'PP')}</p>}
                                        </div>
                                        <GripVertical className="text-gray-400" />
                                    </CardContent>
                                </Card>
                            )})}
                        </div>
                    </div>
                ))}
            </div>
            {modalLead && <LeadModal lead={modalLead} onClose={() => setModalLead(null)} onUpdate={handleUpdateLead} />}
        </div>
    );
}

function LeadModal({ lead, onClose, onUpdate }) {
    const [currentLead, setCurrentLead] = useState(lead);

    const handleFieldChange = (field, value) => {
        setCurrentLead(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        onUpdate(currentLead);
        onClose();
    };

    return (
        <Dialog open={true} onClose={onClose}>
            <DialogContent className="pt-8">
                <DialogHeader>
                    <DialogTitle>{currentLead.companyName}</DialogTitle>
                    <DialogDescription>{currentLead.website}</DialogDescription>
                </DialogHeader>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h4 className="font-semibold mb-2">Contact Info</h4>
                        <div className="space-y-2 text-sm">
                            <p className="flex items-center"><Phone className="mr-2 h-4 w-4 text-gray-500" /> <a href={`tel:${currentLead.phone}`} className="text-blue-600 hover:underline">{currentLead.phone}</a></p>
                            <p className="flex items-center"><Mail className="mr-2 h-4 w-4 text-gray-500" /> <a href={`mailto:${currentLead.email}`} className="text-blue-600 hover:underline">{currentLead.email}</a></p>
                        </div>

                        <h4 className="font-semibold mt-6 mb-2">Times Called</h4>
                        <div className="flex items-center space-x-2">
                            <Button variant="outline" size="sm" onClick={() => handleFieldChange('timesCalled', Math.max(0, currentLead.timesCalled - 1))}>-</Button>
                            <span className="font-bold text-lg w-8 text-center">{currentLead.timesCalled}</span>
                            <Button variant="outline" size="sm" onClick={() => handleFieldChange('timesCalled', currentLead.timesCalled + 1)}>+</Button>
                        </div>
                        
                        <h4 className="font-semibold mt-6 mb-2">Call Back Date</h4>
                        <Input type="date" value={currentLead.callBackDate ? format(parseISO(currentLead.callBackDate), 'yyyy-MM-dd') : ''} onChange={e => handleFieldChange('callBackDate', e.target.value ? parseISO(e.target.value).toISOString() : null)} />
                    </div>
                    <div>
                        <h4 className="font-semibold mb-2">Notes</h4>
                        <textarea
                            value={currentLead.notes}
                            onChange={(e) => handleFieldChange('notes', e.target.value)}
                            className="w-full h-48 p-2 border rounded-md text-sm"
                            placeholder="Add notes about conversations, follow-ups, etc."
                        />
                    </div>
                </div>
            </DialogContent>
            <DialogFooter>
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave}>Save Changes</Button>
            </DialogFooter>
        </Dialog>
    );
}


function AuthPage() {
    const { login, register } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            if (isLogin) {
                await login(email, password);
            } else {
                await register(name, email, password);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center">
            <div className="max-w-md w-full mx-auto">
                <h2 className="text-3xl font-bold text-center text-gray-900 mb-8">
                    {isLogin ? 'Welcome Back to BlueLeads' : 'Create Your Account'}
                </h2>
                <Card className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {!isLogin && (
                            <Input type="text" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} required />
                        )}
                        <Input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} required />
                        <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
                        {error && <p className="text-red-500 text-sm">{error}</p>}
                        <Button type="submit" className="w-full py-3" disabled={isLoading}>{isLogin ? 'Login' : 'Register'}</Button>
                    </form>
                    <p className="mt-6 text-center text-sm text-gray-600">
                        {isLogin ? "Don't have an account?" : "Already have an account?"}
                        <Button variant="link" onClick={() => { setIsLogin(!isLogin); setError(''); }} className="font-medium text-blue-600 hover:text-blue-500">
                            {isLogin ? 'Sign up' : 'Sign in'}
                        </Button>
                    </p>
                </Card>
            </div>
        </div>
    );
}

function AppLayout() {
  const { user, logout } = useAuth();
  const [activeView, setActiveView] = useState('dashboard');
  const [selectedSearch, setSelectedSearch] = useState(null);
  const [crmData, setCrmData] = useState(null); // Fetched once for dashboard/crm
  
  const fetchCrmData = useCallback(async () => {
    try {
        const data = await apiFetch('/api/crm');
        setCrmData(data);
    } catch (err) {
        console.error("Failed to fetch CRM data for dashboard", err);
        // Set a default empty state to prevent crashes
        setCrmData({ leads: {}, columns: { 'tobe-called': { leadIds: [] }, 'contacted': { leadIds: [] } } });
    }
  }, []);

  useEffect(() => {
    if (activeView === 'dashboard' || activeView === 'crm') {
      fetchCrmData();
    }
  }, [activeView, fetchCrmData]);

  const handleSelectSearch = (search) => {
    setSelectedSearch(search);
    setActiveView('leads');
  };

  const handleBackToSearches = () => {
    setSelectedSearch(null);
    setActiveView('searches');
  };

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard':
        return crmData ? <Dashboard crmData={crmData} /> : <FullPageLoader />;
      case 'searches':
        return <Searches onSelectSearch={handleSelectSearch} />;
      case 'leads':
        return <LeadsView search={selectedSearch} onBack={handleBackToSearches} />;
      case 'crm':
        return <CRM />; // CRM component fetches its own data now
      default:
        return crmData ? <Dashboard crmData={crmData} /> : <FullPageLoader />;
    }
  };

  const NavLink = ({ view, children }) => (
    <button
      onClick={() => setActiveView(view)}
      className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${activeView === view ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-blue-600">BlueLeads</h1>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-2">
          <NavLink view="dashboard"><Star className="mr-3 h-5 w-5" />Dashboard</NavLink>
          <NavLink view="searches"><Search className="mr-3 h-5 w-5" />Searches</NavLink>
          <NavLink view="crm"><BarChart className="mr-3 h-5 w-5" />CRM</NavLink>
        </nav>
        <div className="p-4 border-t">
          <DropdownMenu trigger={<div className="flex items-center justify-between w-full text-left"><div><p className="font-semibold">{user.name}</p><p className="text-xs text-gray-500">{user.email}</p></div><ChevronDown size={20} /></div>}>
             <DropdownMenuItem onSelect={logout}>Logout</DropdownMenuItem>
          </DropdownMenu>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-y-auto">
        {renderContent()}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Main />
    </AuthProvider>
  );
}

function Main() {
    const { user, isAuthLoading } = useAuth();

    if (isAuthLoading) {
        return <FullPageLoader />;
    }

    if (!user) {
        return <AuthPage />;
    }

    return <AppLayout />;
}
