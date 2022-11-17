const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const EmailChangeSchema = new Schema({
  userID: String,
  newEmail: String,
  uniqueCode: String,
  createdAt: Date,
  expiresAt: Date,
});

exports.EmailChange = mongoose.model("EmailChange", EmailChangeSchema);
