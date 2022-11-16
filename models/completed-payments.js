const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const CompletedPaymentSchema = new Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InvestmentPlan",
  },

  amount: Number,
  expiryDate: Date,
});

const CompletedPayment = mongoose.model(
  "CompletedPayment",
  CompletedPaymentSchema
);
module.exports = CompletedPayment;
