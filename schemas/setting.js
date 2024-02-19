const config = require("../config");
const mongoose = require("mongoose");

const settingSchema = new mongoose.Schema({
  appointmentNotifications: {
    type: Boolean,
    default: false,
  },
  emergencyNotifications: {
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model("Setting", settingSchema);
