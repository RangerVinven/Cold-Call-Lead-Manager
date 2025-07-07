type search = {
    keyword: string,

}

export default function SearchDashboard() {

    let searches: string[] = [""];

    return (
        <>
        {searches.length === 0
            ? <h1>This is the search</h1>
            : <h1>Here's your searches...</h1>
        }
        </> 
   )
}

