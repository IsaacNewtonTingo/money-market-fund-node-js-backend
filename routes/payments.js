const express = require("express");
const router = express.Router();
const request = require("request");
const datetime = require("node-datetime");
const nodemailer = require("nodemailer");

const User = require("../models/user");
const UserPlan = require("../models/user-plans");
const PendingPayment = require("../models/pending-payments");
const CompletedPayment = require("../models/completed-payments");

require("dotenv").config;

let transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.AUTH_EMAIL,
    pass: process.env.AUTH_PASS,
  },
});

const consumerKey = process.env.CONSUMER_KEY;
const consumerSecret = process.env.CONSUMER_SECRET;

// const consumerKey = "dM1AQniOznQkoFohuPGXowgMALOcUwsr";
// const consumerSecret = "l31P1jJLbwhKkHzy";

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
          //check if user is already on the plan
          await UserPlan.find({
            $and: [{ user: userID, _id: planID }],
          })
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
                        "https://money-market-fund.herokuapp.com/api/user/payments/payment-response",
                      AccountReference: "CompanyXLTD",
                      TransactionDesc: "Payment of X",
                    },
                  },
                  async function (error, response, body) {
                    if (error) {
                      console.log(error);
                      res.json({
                        status: "Failed",
                        message:
                          "Something went wrong trying to process your payment",
                      });
                    } else {
                      console.log("-------STK push is on the way------");
                      const responseIDs = body;
                      const checkoutRequestID = responseIDs.CheckoutRequestID;

                      const newPendingPayment = new PendingPayment({
                        user: userID,
                        userPlan: planID,
                        merchantRequestID: responseIDs.MerchantRequestID,
                        checkoutRequestID: responseIDs.CheckoutRequestID,
                        dateOfPayment: Date.now(),
                        verified: false,
                      });

                      await newPendingPayment
                        .save()
                        .then(() => {
                          //-------------------------------------------------------------------------//
                          checkPayment({ checkoutRequestID }, res);
                          // res.status(200).json(body);
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
                message: "An error occured while checking user plan records",
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
  console.log("--------Data received in the callback url---------");
  if (req.body.Body.stkCallback.ResultCode == 0) {
    //successfull payment
    const { MerchantRequestID, CheckoutRequestID } = req.body.Body.stkCallback;
    const amount = req.body.Body.stkCallback.CallbackMetadata.Item[0].Value;
    const mpesaCode = req.body.Body.stkCallback.CallbackMetadata.Item[1].Value;

    //get pending payment records
    //update pending payment records

    console.log("-------------Updating pending payment records--------------");
    await PendingPayment.findOneAndUpdate(
      {
        $and: [
          { merchantRequestID: MerchantRequestID },
          { checkoutRequestID: CheckoutRequestID },
        ],
      },
      { verified: true }
    )
      .populate("user")
      .populate({
        path: "userPlan",
        populate: {
          path: "plan",
          select: "investmentPlanName",
        },
      })
      .then(async (response) => {
        console.log(
          "-----------Finished updating pending payment records----------"
        );
        if (response) {
          //records found and updated
          //add records to completed payments

          const { user, userPlan } = response;
          const { firstName, lastName, email } = user;
          const investmentPlanName = response.userPlan.plan.investmentPlanName;

          const newCompletedPayment = new CompletedPayment({
            user: user,
            userPlan: userPlan,
            amountPaid: amount,
            dateOfPayment: Date.now(),
            dateVerified: Date.now(),
            mpesaCode: mpesaCode,
          });

          console.log(
            "------------Creating a completed payment record-----------"
          );
          await newCompletedPayment
            .save()
            .then(async () => {
              //update user plan
              await UserPlan.findOneAndUpdate(
                {
                  $and: [{ user: user }, { _id: userPlan }],
                },
                { active: true, $inc: { amountAvailable: amount } }
              ).then(async (response) => {
                if (response) {
                  console.log("Payment successfully made");

                  //send email to me and the client
                  const mailOptions = {
                    from: process.env.AUTH_EMAIL,
                    to: email,
                    subject: "Pament confirmation",
                    html: `<p>Hello <strong>${firstName} ${lastName}</strong>,<br/>You have successfully deposited funds in your <strong>${investmentPlanName}</strong> savings plan. This is a good step and we encounrage you to keep saving. Your funds are safe with us. Take care of uncertainity</p>`,
                  };

                  await transporter.sendMail(mailOptions).then(() => {});
                } else {
                  console.log("No updates made");
                }
              });
            })
            .catch((err) => {
              console.log(err);
            });
        } else {
          //no records found so nothing updated
          console.log("No records found");
        }
      })
      .catch((err) => {
        console.log(err);
        res.json({
          status: "Failed",
          message: "An error occured while updating pending payment records",
        });
      });
  } else {
    //Payment unsuccessfull
    console.log("Payment not completed. Something went wrong");
  }
});

//check payment function
async function checkPayment({ checkoutRequestID }, res) {
  //generate access token
  let CheckoutRequestID = checkoutRequestID;
  let url =
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
  let auth = new Buffer.from(consumerKey + ":" + consumerSecret).toString(
    "base64"
  );
  request(
    {
      url: url,
      method: "get",
      headers: {
        Authorization: "Basic " + auth,
      },
    },
    (error, response, body) => {
      if (error) {
        console.log(error);
      } else {
        const access_token = JSON.parse(body).access_token;

        //check if payment was done
        if (!CheckoutRequestID) {
          res.json({
            status: "Failed",
            message: "Checkout request ID is required",
          });
        } else {
          let auth = "Bearer " + access_token;
          let datenow = datetime.create();
          const timestamp = datenow.format("YmdHMS");

          const password = new Buffer.from(
            "174379" +
              "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919" +
              timestamp
          ).toString("base64");

          var interval = setInterval(() => {
            console.log("Checking payment");
            request(
              {
                url: "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query",
                method: "POST",
                headers: {
                  Authorization: auth,
                },
                json: {
                  BusinessShortCode: 174379,
                  Password: password,
                  Timestamp: timestamp,
                  CheckoutRequestID: CheckoutRequestID,
                },
              },
              async function (error, response, body) {
                if (error) {
                  console.log(error);
                  clearTimeout(timeout);
                  clearInterval(interval);

                  res.json({
                    status: "Failed",
                    message:
                      "Something went wrong while trying to process your request",
                  });
                } else {
                  if (body.ResultCode === "0") {
                    //Transaction success
                    clearTimeout(timeout);
                    clearInterval(interval);

                    console.log("Payment successfull");
                    res.json({
                      status: "Success",
                      message: "You have successfully made your payment",
                    });
                  }
                }
              }
            );
          }, 1000);

          const timeout = setTimeout(() => {
            clearTimeout(timeout);
            clearInterval(interval);

            console.log("Payment not made");
            res.json({
              status: "Failed",
              message:
                "You did not complete the payment process. Please make sure you are next to your phone and make the payment",
            });
          }, 60000);
        }
      }
    }
  );
}

//check if user has paid
router.post("/check-payment-status", access, async (req, res) => {
  const { CheckoutRequestID } = req.body;
  if (!CheckoutRequestID) {
    res.json({
      status: "Failed",
      message: "Checkout request ID is required",
    });
  } else {
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
        url: "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query",
        method: "POST",
        headers: {
          Authorization: auth,
        },
        json: {
          BusinessShortCode: 174379,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: CheckoutRequestID,
        },
      },
      async function (error, response, body) {
        if (error) {
          console.log(error);
          res.json({
            status: "Failed",
            message:
              "Something went wrong while trying to process your request",
          });
        } else {
          if (!body.ResponseCode) {
            //sth went wrong
            res.json({
              status: "Failed",
              message:
                "Something went wrong while trying to process your request",
            });
          } else {
            //theres a response
            if (body.ResultCode != 0) {
              res.json({
                status: "Failed",
                message: "Your transaction was not completed. Please try again",
              });
            } else {
              //Transaction success
              res.json({
                status: "Success",
                message: body.ResultDesc,
              });
            }
          }
        }
      }
    );
  }
});

//get all payments for a given user
router.get("/get-user-payments/:id", async (req, res) => {
  const userID = req.params.id;
  if (!userID) {
    res.json({
      status: "Failed",
      message: "User ID is missing",
    });
  } else {
    //check if user exists
    await User.findOne({ _id: userID })
      .then(async (response) => {
        if (response) {
          //user exists
          //get their payments
          await CompletedPayment.find({ user: userID })
            .limit(10)
            .sort({ dateOfPayment: -1 })
            .populate({ path: "userPlan", populate: { path: "plan" } })
            .then((response) => {
              res.send(response);
            })
            .catch((err) => {
              console.log(err);
              res.json({
                status: "Failed",
                message: "An error occured while checking user payment records",
              });
            });
        } else {
          //no user
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
          message: "An error occured while checking user records",
        });
      });
  }
});

//B2C integration
router.post("/b2c", access, async (req, res) => {
  let auth = "Bearer " + req.access_token;

  request(
    {
      url: "https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest",
      method: "POST",
      headers: {
        Authorization: auth,
      },
      json: {
        InitiatorName: "apitest342",
        SecurityCredential:
          "juPO3mlv/YKcZN3FyGmjW81BO3d0qYVuSlyVGvr+uevXeaKwpZu5L415tEypKdekqJCdzc75hlYbbL+o3HpvNgnP5vf5yO1CNgHX8UrctyX+oturBR1J2xwijwqF78HiNNiDkDOb9nB2XbzfVlOWTrzZT3NoU3NCs5C9o+2UsjXwPW+ITbijn9saMcs/EBw1ILV6eNFxIyUqtTIgh/2gbSlYUd+uXwgi4cbT2M7nSqsY9EajyGEQItT42ZoTbfxK5JYGPn4FGic7//UMlwGzDAYsNWduKUblkWs67iK/BwiT5Y3ib9ghp5rzpLD9pRDY5IUG2UlV2sBHS18NdIx1Ig==",
        CommandID: "BusinessPayment",
        Amount: 1230,
        PartyA: 601342,
        PartyB: 254708374149,
        Remarks: "Payment for parties",
        QueueTimeOutURL:
          "https://money-market-fund.herokuapp.com/api/user/payments/timeout-url",
        ResultURL:
          "https://money-market-fund.herokuapp.com/api/user/payments/result-url",
        Occassion: "Christmas",
      },
    },
    async function (error, response, body) {
      if (error) {
        console.log(error);
      } else {
        res.send(body);
      }
    }
  );
});

//timeout url
router.post("/timeout-url", async (req, res) => {
  console.log("------------Timeout----------");
  console.log(req.body);
});

//result url
router.post("/result-url", async (req, res) => {
  console.log("------------result----------");
  console.log(req.body.Result);
});

module.exports = router;
