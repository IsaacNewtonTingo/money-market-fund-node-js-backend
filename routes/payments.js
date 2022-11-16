const express = require("express");
const router = express.Router();
const request = require("request");
const InvestmentPlan = require("../models/investment-plans");
const User = require("../models/user");
const UserPlan = require("../models/user-plans");

const datetime = require("node-datetime");
const PendingPayment = require("../models/pending-payments");
const { json } = require("body-parser");

require("dotenv").config;

const consumerKey = process.env.CONSUMER_KEY;
const consumerSecret = process.env.CONSUMER_SECRET;

//generate acccess token
function access(req, res, next) {
  let url =
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
  let auth = new Buffer.from(consumerKey + ":" + consumerSecret).toString(
    "base64"
  );
  request(
    {
      url: url,
      headers: {
        Authorization: "Basic " + auth,
      },
    },
    (error, response, body) => {
      if (error) {
        console.log(error);
      } else {
        req.access_token = JSON.parse(body).access_token;
        next();
      }
    }
  );
}

//get access token
router.get("/access-token", access, (req, res) => {
  res.status(200).json({ access_token: req.access_token });
});

//pay for a plan
router.post("/make-payment", access, async (req, res) => {
  const { phoneNumber, userID, planID, amount } = req.body;

  if (!phoneNumber) {
    res.json({
      status: "Failed",
      message: "Phone number is required",
    });
  } else if (!userID) {
    res.json({
      status: "Failed",
      message: "User ID is missing",
    });
  } else if (!planID) {
    res.json({
      status: "Failed",
      message: "Plan ID is missing",
    });
  } else if (!amount) {
    res.json({
      status: "Failed",
      message: "Amount to invest is missing",
    });
  } else {
    //check if user exists
    await User.findOne({ _id: userID })
      .then(async (response) => {
        if (response) {
          //user found
          //check if plan exists
          await InvestmentPlan.findOne({ _id: planID })
            .then(async (response) => {
              if (response) {
                //plan available
                //check if user is already on the plan
                await UserPlan.find({ user: userID })
                  .then(async (response) => {
                    if (response.length > 0) {
                      //user already on that plan
                      //go ahead and pay

                      let auth = "Bearer " + req.access_token;
                      let datenow = datetime.create();
                      const timestamp = datenow.format("YmdHMS");

                      const password = new Buffer.from(
                        "174379" +
                          "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919" +
                          timestamp
                      ).toString("base64");
                      request(
                        {
                          url: "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
                          method: "POST",
                          headers: {
                            Authorization: auth,
                          },
                          json: {
                            BusinessShortCode: 174379,
                            Password: password,
                            Timestamp: timestamp,
                            TransactionType: "CustomerPayBillOnline",
                            Amount: amount,
                            PartyA: parseInt(phoneNumber),
                            PartyB: 174379,
                            PhoneNumber: parseInt(phoneNumber),
                            CallBackURL:
                              "https://ni-hire-backend.herokuapp.com/user/payment-response",
                            AccountReference: "CompanyXLTD",
                            TransactionDesc: "Payment of X",
                          },
                        },
                        async function (error, response, body) {
                          if (error) {
                            console.log(error);
                          } else {
                            const responseIDs = body;

                            const newPendingPayment = new PendingPayment({
                              user: userID,
                              plan: planID,
                              merchantRequestID: responseIDs.MerchantRequestID,
                              checkoutRequestID: responseIDs.CheckoutRequestID,
                              dateOfPayment: Date.now(),
                              verified: false,
                            });

                            await newPendingPayment
                              .save()
                              .then(() => {
                                res.status(200).json(body);
                              })
                              .catch((err) => {
                                console.log(err);
                                res.json({
                                  status: "Failed",
                                  message:
                                    "An error occured while saving pending payment",
                                });
                              });
                          }
                        }
                      );
                    } else {
                      //User is not on that plan
                      res.json({
                        status: "Failed",
                        message:
                          "You're not currently on this plan. Please join first",
                      });
                    }
                  })
                  .catch((err) => {
                    console.log(err);
                    res.json({
                      status: "Failed",
                      message:
                        "An error occured while checking user plan records",
                    });
                  });
              } else {
                //plan not found
                res.json({
                  status: "Failed",
                  message: "Investment plan not found. Might have been deleted",
                });
              }
            })
            .catch((err) => {
              console.log(err);
              res.json({
                status: "Failed",
                message:
                  "An error occured while checking investment plan records",
              });
            });
        } else {
          //user not found
          res.json({
            status: "Failed",
            message: "User not found",
          });
        }
      })
      .catch((err) => {
        console.log(err);
        res.json({
          status: "Failed",
          message: "An error occured while checking user details",
        });
      });
  }
});

//payment response
router.post("/payment-response", async (req, res) => {
  console.log(req.body.Body);
});

//check if user has paid

module.exports = router;
