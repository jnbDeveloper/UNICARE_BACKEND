const mongoose = require("mongoose");
const config = require("./config");

mongoose
  .connect(`${config.dbServer}/${config.db}`)
  .then(() => {
    console.log("Database connection successful");
  })
  .catch(() => {
    console.log("Database connection error");
  });

module.exports = mongoose;
