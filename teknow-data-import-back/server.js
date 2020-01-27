const express = require('express');
const cors = require('cors');

const server = express()

var corsOptions = {
  origin: '*',
  optionsSuccessStatus: 200,
}

server.use(cors(corsOptions))
server.use(express.json());
server.use(express.urlencoded());

server.listen(3001, () => {
  console.log('Server started!')
})

