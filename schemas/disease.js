const mongoose = require("mongoose");

function capitalize(text) {
  if (text) {
    const fl = text.charAt(0).toUpperCase();
    return fl + text.slice(1);
  }
  return text;
}

const diseaseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    maxlength: 50,
  },
});

diseaseSchema.pre("save", function (next) {
  if (this.isModified("name")) {
    this.name = capitalize(this.name);
  }
  next();
});

module.exports = mongoose.model("Disease", diseaseSchema);
