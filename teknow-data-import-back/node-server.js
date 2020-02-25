const express = require('express');
const cors = require('cors');
/* node-upload.js contains:
- upload function to upload the file
- list function to list the files contained in uploads and uploads/mapping-files directories
- download function when the user clicks on a file link to download it

*/
const file = require('./node-upload');

/* crud-database contains:
- getTablesList function to get the list of existing tables in the database
- dropTable function to drop a user selected table from the database
- importExcelFile function to parse the Excel file content and save it in a new table of the database
*/
const db = require('./node-database');

const server = express();

var corsOptions = {
  origin: '*',
  optionsSuccessStatus: 200,
};

server.use(cors(corsOptions));
server.use(express.json());
server.use(express.urlencoded());

// 'tables' route is used for all interaction with the database
server.get('/tables', db.getTablesList);
server.delete('/tables', db.dropTable);
server.post('/tables', db.importExcelFile);

// 'upload' route is used for listing the files and uploading a new file
server.post('/upload', file.upload);
server.get('/upload', file.list);


// 'file' route is used when the user downloads a file
server.get('/file', file.download);

server.listen(3001, () => {
  console.log('Server started!');
});

