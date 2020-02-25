/*
formidable is a library used to parse the incoming file upload
https://www.npmjs.com/package/formidable
*/
const IncomingForm = require('formidable').IncomingForm;

/*
xlsx is a library used to read the excel file
https://www.npmjs.com/package/xlsx
*/
const XLSX = require('xlsx');

/*fs is the node module used to manipulate the uploaded file (rename, move to uploads folder, create the json file) 
https://nodejs.org/api/fs.html#fs_file_system
*/
const fs = require('fs');

/* upload
- stores the uploaded file in the uploads folder
- renames the uploaded file by adding the current timestamp to its name to ensure it is unique
- calls the prepareJsonMapping to create the corresponding Json mapping file
@params {Object} req - the HTTP request object (see https://expressjs.com/fr/api.html#req)
@params {Object} res - the HTTP response object sent back to the front end (see https://expressjs.com/fr/api.html#res)
@returns {Object} jsonFileAttributes - an object containing the paths to the JSON and Excel files and the JSON data
*/
exports.upload = (req, res) => {
  // initialize an incoming form to specify the path to store the file
  var form = new IncomingForm({ 
      uploadDir: 'uploads/',
      keepExtensions: true
    });
    
  form.on('file', (field, file) => {
    
    // file.path contains the full path of the file inclidung its folder, e.g. folder/file-name.xlsx
    let filePath = file.path;
    
    // newfilePath adds the current timestamp to the file name contained in filePath (to ensure it is unique), e.g folder/file-name_157567865.xlsx
    let newfilePath = filePath.split('.')[0] + "_" +Math.floor(Date.now() / 1000).toString() + "." + filePath.split('.')[1];
    
    // use fs.rename to rename the file 
    fs.rename(filePath, newfilePath, (err) => {
      if (err) throw err;
      //once  the file has been renamed, create the corresponding json mapping file
      prepareJsonMappingFile(newfilePath).then((jsonFileAttributes)=>{
        // return the jsonFileAttributes containing the paths to the JSON and Excel files and the JSON data
        res.json(jsonFileAttributes)
        return jsonFileAttributes;
      })
    });
    
    
  })
  form.parse(req)
}

/* list
Retieves a list of 10 files from the uploads folder
@params {Object} req - the HTTP request object (see https://expressjs.com/fr/api.html#req).
it contains the pagination elements: pageSize, page (index), order (ascendant or descendant)
@params {Object} res - the HTTP response object sent back to the front end (see https://expressjs.com/fr/api.html#res)
@returns {Object} result - an object containing the total number of files stored in the uploads folder and the attributes of the 10 requested files
*/
exports.list = (req, res) => {
    //pagination attributes from the HTTP request
    let pageSize = parseInt(req.query.pageSize);
    let page = parseInt(req.query.page);
    let order = req.query.order;
    //path to the folder containing the files
		let dir = './uploads/'
		//result variable will be returned to the front end
		let result = {};
		
		//retrieve all files from the uploads directory 
		let all_files = fs.readdirSync(dir)
		
		//insert the total number of files in the result variable
		result.total = all_files.length;
		
		//loop through all_files to get more info on each file (necessary for the pagination)
		let files = [];
		all_files.forEach((file)=>{
		    let itemAttributes = fs.statSync(dir + file);
		    if(itemAttributes.isFile()){
		        let temp = {};
                temp.name = file;
                temp.path_excel = encodeURIComponent(file);
                temp.created = itemAttributes.birthtime;
                temp.created_ms = itemAttributes.birthtime.getTime();
                temp.json_file = temp.name.substr(0, file.lastIndexOf(".")) + ".json";
                temp.path_json = temp.path_excel.substr(0, temp.path_excel.lastIndexOf(".")) + ".json";
                temp.rootUrl = "http://localhost:3000/file";
                temp.rootURLMapping = "http://localhost:3000/mapping-file";
                files.push(temp);
		    }
		})

		//sort the files variable by the requested order
		files.sort(function(a, b) { 
                   return order == "desc"? b.created_ms - a.created_ms : a.created_ms - b.created_ms; 
                   
               })
    
    //get a subset of the files variable corresponding to the pagination attributes, page (index) and pageSize.
    let slicedFilesList = files.slice((page * pageSize), (page * pageSize)+pageSize);
		
		result.data = slicedFilesList;
		res.json(result);
};


/* prepareJsonMappingFile
create a JSON file based on the uploaded excel file. The content is an array of objects, each object representing a column label of the excel file.
It will be used to create the DB table schema
@params {string} filtPath - the path to the uploaded excel file.
@returns {promise} promise - promise initialized at the start of the function and resolved after the JSON file has been created with its content
*/
function prepareJsonMappingFile(filePath){
    // this function is included in a promise to better control the flow (fs.writefile is an async function)
    let promise = new Promise((resolve, reject) => {
      //get the excel workbook attributes and content. sheetRows options allows to limite the range to the 2 first rows
      let workbook = XLSX.readFile(filePath, {sheetRows: 2});
      // workbook.SheetNames is an array containing all sheets of the workbook. We will consider only the first one.
      let sheetsList = workbook.SheetNames;
      //sheet to json and given options returns an array of arrays (1 per excel lines), the first sub array being the header
      // with defVal we can force any empty excel cell (null or undefined by default) to be returned as an empty string
      let sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetsList[0]], {
          header: 1,
          defval: '',
          blankrows: true
      });
      let result = {};
      
      let raw = [];
      // we use the filePath of the ecel file to define the file path of the JSON file we are creating (it will be stored in the mapping-files folder under uploads)
      let jsonFilePath = (filePath.substr(0, filePath.lastIndexOf(".")) + ".json").split("/");
      jsonFilePath = jsonFilePath[0] + "/mapping-files/" + jsonFilePath[1];
      
      //loop through the header to create the JSON content
      for(let i = 0 ; i < sheetData[0].length ; i++){
        let temp = {};
        temp.excel_column = sheetData[0][i];
        temp.db_table_column = sheetData[0][i].normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z ]/g, "").replace(/ /g, "_").toLowerCase();
        // we use the content of the seond row to dertermine the SAL column types, default type is TEXT
        if(sheetData[1][i] && sheetData[1][i].toString().indexOf("   ,   ") != -1){
          temp.column_type = "TEXT[]";
        }else{
          temp.column_type ="TEXT";
        }
        raw.push(temp);
      }
    
    //result is the variable which will be resolved by the promise
    result.excel_file = filePath;
    result.json_file = jsonFilePath;
    result.json_data = raw;
    
    fs.writeFile(jsonFilePath, JSON.stringify(raw), function (err) {
      if (err) {
        reject(err);
      }else{
        console.log('File is created successfully.');
        resolve(result);
      }
    }); 
  });
  
  return promise;
}

exports.download = (req, res) => {
  const file = (req.query.type == "excel")? `${__dirname}/uploads/${req.query.file}` : `${__dirname}/uploads/mapping-files/${req.query.file}`;
  res.download(file); 
  
}