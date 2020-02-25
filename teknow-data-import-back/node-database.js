/*
node-postgres is a collection of node.js modules for interfacing with our PostgreSQL database.
https://node-postgres.com/
*/
const { Pool } = require('pg')

/*
xlsxstream is a node library which will allows to use streams to read the excel file
https://github.com/Claviz/xlstream
*/
const { getXlsxStream } = require('xlstream');

//configuration data used to connect to the postgres database
const configPool = {
  host: 'coservit.cbdmgtweoi8v.eu-west-3.rds.amazonaws.com',
  port: 5432,
  user: 'postgres',
  password: 'Fv0v5HP0#HNOU#4T!IWt',
  database:'test-db',
  max: 20,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 2000,
}


/* upload
async function to create a new table in the postgres database. we use async/await to better control the flow of the main finction importExcelFile
@params {String} tableName - user defined string to be used as the table name
@params {Array} columnNames - user defined column names for the table
@params {Array} columnTypes - user defined column types
@returns
*/
async function createTable (tableName,columnNames, columnTypes){
  let pool = new Pool(configPool);
  
  //table config will contained the column names/types association that will be used in the query 
  let tableConfig = "id SERIAL PRIMARY KEY, "
  for(let i = 0; i < columnNames.length; i++ ){
    tableConfig += columnNames[i] + " " + columnTypes[i];
    if(columnNames[i + 1]){
      tableConfig += ", ";
    }
  }
  
  //table creation query
  let query = 'CREATE TABLE ' + tableName +'(' + tableConfig + ')';
  
  await pool.connect()
      
  return await pool.query(query)
  await pool.end();
}

/* insertData
async function to data in the postgres database table. we use async/await to better control the flow of the main function importExcelFile
@params {String} tableName - user defined string to be used as the table name
@params {Array} columnNames - user defined column names for the table
@params {Array} allValues - values to be inserted in the table
@returns
*/
async function insertData(tableName,columnNames, allValues){
  let pool = new Pool(configPool);
  
  //table config will contained the column names that will be used in the query 
  let tableConfig = "";
  
  for(let i = 0; i < columnNames.length; i++ ){
    tableConfig += columnNames[i];
    if(columnNames[i + 1]){
      tableConfig += ", ";
    }
  }
  
  //initialize the query string
  let query = 'INSERT INTO ' + tableName +' (' + tableConfig + ') VALUES ';

  //loop through allValues argument to format the values in the query. allValues is an array of arrays. Each sub array is a set of values to be inserted in a table row
  for(let j = 0 ; j < allValues.length; j++){
    //allValues[j] is an entire row of the excel file
     let formattedValues = "( ";
      for(let i = 0; i < allValues[j].length; i++ ){
        //allValues[j][i] represent a a single cell of the Excel row
        if(allValues[j][i] != ""){
          //check the type of allValues[j][i] to determine if it will be stored as a string or an array in the table
          if (typeof allValues[j][i] === 'object' || allValues[j][i] instanceof Object){
            formattedValues +=  " ARRAY['" + allValues[j][i].join("','") + "']";
          }else{
            formattedValues += "'" + allValues[j][i].replace("'","\\'") + "'";
          }
        }else{
          //use NULL to insert an empty value
          formattedValues += "NULL";
        }
        if(allValues[j][i + 1] || allValues[j][i + 1] == ""){
          formattedValues += ", ";
        }
      }
      formattedValues += " )";
      if(allValues[j+1]){
        formattedValues += ", ";
      }
      query += formattedValues
  }
 
  
  
  await pool.connect()
  try{
    return await pool.query(query);
  }catch(err){
    console.log("ERROR!!!!")
    console.log(err)
    throw err
  }
  await pool.end();
}

/* importExcelFile
main function called when the user confirms the JSON mapping and the import of the excel file into a new database table
@params {Object} req - the HTTP request object (see https://expressjs.com/fr/api.html#req)
@params {Object} res - the HTTP response object sent back to the front end (see https://expressjs.com/fr/api.html#res)
@returns
*/
exports.importExcelFile = (req, res) => {
  //the request from the front end contains the excel file path, the JSON mapping (excel columns to table columns) and the name which should be used to create the db table.
  let filePath = req.body.excelFilePath;
  let jsonMapping = req.body.jsonData;
  let tableName = req.body.tableName;
  
  let header = [];
  let columnTypes = [];
  let buffers = [];
  
  //header will be used for the column names of the tables and columnTypes for their types Both come from the Json mapping validated by the user
  for(let item of jsonMapping){
    header.push(item.db_table_column);
    columnTypes.push(item.column_type);
  }
  
  // first we have to create the table using the createTable function defined above
  createTable(tableName,header, columnTypes)
  .then(async (x) => {
      //once the table has been created in the database, we start streaming the excel content of the first sheet
      const stream = await getXlsxStream({
          filePath: filePath,
          sheet: 0,
          withHeader:true,
          ignoreEmpty:false
          
      })
  .catch((err) => {
    console.log(err);
  });
      stream.on('data', x => {
        //the data event is called for every row in the excel sheet (values are contained in the x variable)
        let formattedValues = [];
        let values = x.raw.arr;
        // we reuse the header variable to define the column names in the insert data query
        header = [];
        for(let [i, head] of x.header.entries()){
          //the excel sheet can have columns that will be ignored. we consider only what the user has validated in the JSON mapping
          let mappingItem = jsonMapping.find( item => item.excel_column === head);
          if(mappingItem){
            header.push(mappingItem.db_table_column);
            if(values[i]){
              //the values coming from the Excel sheet row wiil be stored either as an array or as a string
              if(mappingItem.column_type.indexOf("[]") != -1){
                formattedValues.push(values[i].split("   ,   "));
              }else{
                formattedValues.push(values[i]);
              }
            }else{
              formattedValues.push("");
            }
          }
        }
        //formatted values of the row are stored in the buffers variabke
        buffers.push(formattedValues);
      });
      
      //once all the rows of the excel sheet have been read the end event is called and the buffers variable contains all the values to be inserted in the table
      stream.on('end',  x => {
          try{
            insertData(tableName,header, buffers)
            .then(()=>{
              console.log("Promise is done");
              res.status(200).send({message: `Table tableName created successfully`});
              
              })
              .catch((err)=>{
                res.status(500).send({message: err});
              });
          }catch(err){
            console.log("error on insert data")
            console.log(err)
          }
      });
  })
  .catch((err) => {
    return res.status(500).send({
       message: err
    });
  });
  
}


exports.dropTable = (req, res) => {

  let pool = new Pool(configPool);
  
  
  let query = 'DROP TABLE ' + req.query.table;
  console.log(query)
  pool.connect()
  .then(client =>{
    return client
      
  .query(query)
      
	.then(result => {
	  console.log(result)
	  res.status(200).send({message: `Table ${req.query.table} successfully dropped`});
	  client.end()
	})
	.catch(err => {	
		console.log('Error executing query', err.stack);
		pool.end();
    });
  })
}




/**
 * Get the list of tables (including rows count for each table from the postgres database 'coservit'
 * It is called when the iangular app is loading
 * Response:
 * {
 *  "data": [{
 *    "table_name": [string],
 *    "count" : [string]
 *  },
 *  ...
 *  ],
 *  "total": [number]
 * }
 */
exports.getTablesList = (req, res) => {
  let pool = new Pool(configPool);
  let itemsPerPage = parseInt(req.query.pageSize);
  let page = parseInt(req.query.page);
  let order = req.query.order;
  // This query is paginated and also get the total number of items matching the main query
  //see https://stackoverflow.com/questions/28888375/run-a-query-with-a-limit-offset-and-also-get-the-total-number-of-rows
  let query = 	`WITH cte AS (
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_name NOT LIKE '%pg_%' 
   AND table_name NOT LIKE '%sql_%' 
   AND table_type = 'BASE TABLE'
   )
  SELECT *
  FROM  (
     TABLE  cte
     LIMIT  ${itemsPerPage}
     OFFSET ${page  * itemsPerPage}
     ) sub
  RIGHT  JOIN (SELECT count(*) FROM cte) c(full_count) ON true;`
// create connection to retreive the client object
  pool.connect()
  .then(client =>{
    return client
      //first query to retrieve the list of all user defined tables (default pg tables are excluded using the WHERE statement)
      
      .query(query)
      .then(tables => {
        //when the result of the first query is available, parse and return it
        let results = {};
        results.data = tables.rows;
        if(tables.rows.length > 0){
          results.total = tables.rows[0].full_count;
        }
        
        return results;
      })
      .then(async results => {
        //using the result of the first query, get the exact rows count for each table
        //async / await is used to make sure to have the results before moving forward
        let tablesWithRowsCount = {};
        tablesWithRowsCount.data = [];
        tablesWithRowsCount.total = results.total;
        for(let row of results.data){
          let temp = row;
          let query = 'SELECT count(*) FROM ' + row.table_name;
          let thisResult = await client.query(query);
          temp.count = parseInt(thisResult.rows[0].count);
          tablesWithRowsCount.data.push(temp)
        }
        return tablesWithRowsCount;
      })
      .then(finalResults => {
        res.json(finalResults)
        client.release();
      })
      .catch(err => {
        client.release()
        console.log(err.stack)
      })
    
  })
}