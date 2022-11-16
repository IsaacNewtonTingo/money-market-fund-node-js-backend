const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const PendingPaymentSchema = new Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InvestmentPlan",
  },
  amount: Number,

  merchantRequestID: String,
  checkoutRequestID: String,

  dateOfPayment: Date,
  verified: Boolean,
});

const PendingPayment = mongoose.model("PendingPayment", PendingPaymentSchema);
module.exports = PendingPayment;
