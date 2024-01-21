const mongoose = require("mongoose");

const facultySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    maxlength: 50,
  },
});

module.exports = facultySchema;
module.exports = mongoose.model("Faculty", facultySchema);
