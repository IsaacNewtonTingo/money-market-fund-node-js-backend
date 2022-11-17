const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
require("dotenv").config();

const User = require("../models/user");
const UserVerification = require("../models/user-verification");
const PasswordReset = require("../models/password-reset");
const { EmailChange } = require("../models/email-change");

let transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.AUTH_EMAIL,
    pass: process.env.AUTH_PASS,
  },
});

//signup
router.post("/signup", async (req, res) => {
  let { firstName, lastName, email, phoneNumber, password } = req.body;

  firstName = firstName.trim();
  lastName = lastName.trim();
  email = email.trim();
  phoneNumber = phoneNumber.toString().trim();
  password = password.trim();

  if (!firstName || !lastName || !email || !phoneNumber || !password) {
    res.json({
      status: "Failed",
      message: "All fields are required",
    });
  } else if (!/^[a-zA-Z ]*$/.test(firstName, lastName)) {
    res.json({
      status: "Failed",
      message: "Invalid name format",
    });
  } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
    res.json({
      status: "Failed",
      message: "Invalid email",
    });
  } else if (password.length < 8) {
    res.json({
      status: "Failed",
      message: "Password is too short",
    });
  } else {
    await User.find({ $or: [{ email }, { phoneNumber }] })
      .then((result) => {
        if (result.length) {
          res.json({
            status: "Failed",
            message: "User with the given email/phone number already exists",
          });
        } else {
          const salt = 10;
          bcrypt
            .hash(password, salt)
            .then((hashedPassword) => {
              const newUser = new User({
                firstName,
                lastName,
                email,
                phoneNumber: parseInt(phoneNumber),
                password: hashedPassword,
                verified: false,

                profilePicture: "",
              });
              newUser
                .save()
                .then((result) => {
                  //Send email
                  sendVerificationEmail(result, res);
                })
                .catch((err) => {
                  console.log(err);
                  res.json({
                    status: "Failed",
                    message: "Error occured while creating account",
                  });
                });
            })
            .catch((err) => {
              console.log(err);
              res.json({
                status: "Failed",
                message: "Error occured while hashing password",
              });
            });
        }
      })
      .catch((err) => {
        console.log(err);
        res.json({
          status: "Failed",
          message: "Error occured when checking email and phoneNumber",
        });
      });
  }
});

//send code to email
const sendVerificationEmail = ({ _id, email }, res) => {
  const confirmationCode = Math.floor(1000 + Math.random() * 9000).toString();

  const mailOptions = {
    from: process.env.AUTH_EMAIL,
    to: email,
    subject: "Verify your email",
    html: `<p>Hello,<br/>Verify your email to complete your signup process.<br/>Here is your verification code: <h2>${confirmationCode}</h2><br/>The code expires in the next 1hr.</p>`,
  };

  const saltRounds = 10;
  bcrypt
    .hash(confirmationCode, saltRounds)
    .then((hashedConfirmationCode) => {
      const newVerification = new UserVerification({
        userID: _id,
        confirmationCode: hashedConfirmationCode,
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });
      newVerification
        .save()
        .then(() => {
          transporter
            .sendMail(mailOptions)
            .then(() => {
              res.json({
                status: "Pending",
                message: "Verification email sent",
                data: _id,
              });
            })
            .catch((err) => {
              console.log(err);
              res.json({
                status: "Failed",
                message: "Error occured sending verification email",
              });
            });
        })
        .catch((err) => {
          console.log(err);
          res.json({
            status: "Failed",
            message: "Couldn't save verification email data",
          });
        });
    })
    .catch((err) => {
      console.log(err);
      res.json({
        status: "Failed",
        message: "Error occured hashing email data",
      });
    });
};

//email verification code validation
router.post("/verify-email/:id", async (req, res) => {
  let { confirmationCode } = req.body;
  let userID = req.params.id;

  confirmationCode = confirmationCode.trim();
  userID = userID.trim();

  UserVerification.find({ userID })
    .then(async (response) => {
      if (response.length > 0) {
        //records found
        //check if code has expired
        const { expiresAt } = response[0];
        const hashedCode = response[0].confirmationCode;

        if (expiresAt < Date.now()) {
          //Has expired so delete
          await UserVerification.deleteMany({ userID })
            .then(async () => {
              await User.deleteOne({ _id: userID })
                .then(() => {
                  res.json({
                    status: "Failed",
                    message:
                      "The code you entered has already expired. Please sign up again",
                  });
                })
                .catch((err) => {
                  console.log(err);
                  res.json({
                    status: "Failed",
                    message: "Error occured while deleting expired user",
                  });
                });
            })
            .catch((err) => {
              console.log(err);
              res.json({
                status: "Failed",
                message: "Error occured while deleting expired code",
              });
            });
        } else {
          //has not expired
          //decrypt the code
          await bcrypt
            .compare(confirmationCode, hashedCode)
            .then(async (response) => {
              if (response) {
                //delete record
                await UserVerification.deleteMany({ userID })
                  .then(async () => {
                    //update user records
                    await User.updateOne({ _id: userID }, { verified: true })
                      .then(() => {
                        res.json({
                          status: "Success",
                          message:
                            "Email confirmed successfully. You can login",
                        });
                      })
                      .catch((err) => {
                        console.log(err);
                        res.json({
                          status: "Failed",
                          message: "Error occured while updating user records",
                        });
                      });
                  })
                  .catch((err) => {
                    console.log(err);
                    res.json({
                      status: "Failed",
                      message: "Error occured while deleting confirmed code",
                    });
                  });
              } else {
                res.json({
                  status: "Failed",
                  message: "Invalid code",
                });
              }
            })
            .catch((err) => {
              console.log(err);
              res.json({
                status: "Failed",
                message: "Error occured while comparing codes",
              });
            });
        }
      } else {
        //no records found
        res.json({
          status: "Failed",
          message: "No email verification records found",
        });
      }
    })
    .catch((err) => {
      console.log(err);
      res.json({
        status: "Failed",
        message: "Error occured finding verification records",
      });
    });
});

//resend code
router.post("/resend-email-verification-code/:id", async (req, res) => {
  //check if user has already created account
  const userID = req.params.id;
  await User.findOne({ _id: userID })
    .then(async (userResponse) => {
      if (userResponse) {
        //user found
        //check preexisting code and delate
        await UserVerification.findOneAndDelete({ userID })
          .then((response) => {
            if (response) {
              //records found and deleted
              //send new code and save
              sendVerificationEmail(userResponse, res);
            } else {
              //no record found
              res.json({
                status: "Failed",
                message: "User verification records not found.Please signup",
              });
            }
          })
          .catch((err) => {
            console.log(err);
            res.json({
              status: "Failed",
              message: "Error occured while getting user verification records",
            });
          });
      } else {
        //no user
        res.json({
          status: "Failed",
          message: "User not found. Please create an account",
        });
      }
    })
    .catch((err) => {
      console.log(err);
      res.json({
        status: "Failed",
        message: "Error occured while checking user records",
      });
    });
});

//login
router.post("/signin", (req, res) => {
  console.log("Connected");
  let { email, password } = req.body;
  email = email.trim();
  password = password.trim();

  if (!email || !password) {
    res.json({
      status: "Failed",
      message: "All fields are required",
    });
  } else {
    User.find({ email })
      .then((data) => {
        if (data.length) {
          if (!data[0].verified) {
            res.json({
              status: "Failed",
              message: "Email hasn't been verified",
            });
          } else {
            const hashedPassword = data[0].password;
            const userData = [{ _id: data[0]._id }];

            bcrypt
              .compare(password, hashedPassword)
              .then(async (result) => {
                if (result) {
                  res.json({
                    status: "Success",
                    message: "Login successfull",
                    data: userData,
                  });
                } else {
                  res.json({
                    status: "Failed",
                    message: "Invalid password",
                  });
                }
              })
              .catch((err) => {
                console.log(err);
                res.json({
                  status: "Failed",
                  message: "Error occured while comparing passwords",
                });
              });
          }
        } else {
          res.json({
            status: "Failed",
            message: "Invalid credentials entered",
          });
        }
      })
      .catch((err) => {
        res.json({
          status: "Failed",
          message: "Error occured checking existing user",
        });
      });
  }
});

//password reset
router.post("/request-password-reset", (req, res) => {
  const { email, redirectUrl } = req.body;

  if (!email) {
    res.json({
      status: "Failed",
      message: "Please input email",
    });
  } else {
    User.find({ email })
      .then((data) => {
        if (data.length) {
          if (!data[0].verified) {
            res.json({
              status: "Failed",
              message: "Email hasn't been verified yet. Check your email",
            });
          } else {
            sendResetEmail(data[0], redirectUrl, res);
          }
        } else {
          res.json({
            status: "Failed",
            message: "No account with the given email exists",
          });
        }
      })
      .catch((err) => {
        res.json({
          status: "Failed",
          message: "Error occured whie checking existing user",
        });
      });
  }
});

const sendResetEmail = ({ _id, email }, redirectUrl, res) => {
  const resetString = Math.floor(1000 + Math.random() * 9000).toString();

  PasswordReset.deleteMany({ userId: _id })
    .then((result) => {
      const mailOptions = {
        from: process.env.AUTH_EMAIL,
        to: email,
        subject: "Reset your password",
        html: `<p>You have initiated a reset password process.</p><p>Code <b>expires in 60 minutes</p> <p>Here is your secret code:</p><p><strong>${resetString}</strong><br/>Enter the code in the app, with your new password.</p>`,
      };

      const saltRounds = 10;
      bcrypt
        .hash(resetString, saltRounds)
        .then((hashedResetString) => {
          const newPasswordReset = new PasswordReset({
            userId: _id,
            resetString: hashedResetString,
            createdAt: Date.now(),
            expiresAt: Date.now() + 3600000,
          });

          newPasswordReset
            .save()
            .then(() => {
              transporter
                .sendMail(mailOptions)
                .then(() => {
                  res.json({
                    status: "Pending",
                    message: _id,
                  });
                })
                .catch((err) => {
                  res.json({
                    status: "Failed",
                    message: "Error sending password reset email",
                  });
                });
            })
            .catch((err) => {
              console.log(err);
              res.json({
                status: "Failed",
                message: "Error occured saving reset record",
              });
            });
        })
        .catch((err) => {
          console.log(err);
          res.json({
            status: "Failed",
            message: "Error while hashing password reset data",
          });
        });
    })
    .catch((err) => {
      console.log(err);
      res.json({
        status: "Failed",
        message: "Error while clearing past records",
      });
    });
};

//reset password
router.post("/reset-password", (req, res) => {
  let { userId, resetString, newPassword } = req.body;
  userId = userId.trim();
  resetString = resetString.trim();
  newPassword = newPassword.trim();

  PasswordReset.find({ userId })
    .then((result) => {
      if (result.length > 0) {
        const { expiresAt } = result[0];
        const hashedResetString = result[0].resetString;

        if (expiresAt < Date.now()) {
          PasswordReset.deleteOne({ userId })
            .then(() => {
              res.json({
                status: "Failed",
                message: "Password reset link has expired",
              });
            })
            .catch((err) => {
              console.log(err);
              res.json({
                status: "Failed",
                message: "Failed to delete outdated password reset record",
              });
            });
        } else {
          bcrypt
            .compare(resetString, hashedResetString)
            .then((result) => {
              if (result) {
                const saltRounds = 0;
                bcrypt
                  .hash(newPassword, saltRounds)
                  .then((hashedNewPassword) => {
                    User.updateOne(
                      { _id: userId },
                      { password: hashedNewPassword }
                    )
                      .then(() => {
                        PasswordReset.deleteOne({ userId })
                          .then(() => {
                            res.json({
                              status: "Success",
                              message:
                                "You have successfully reset your password",
                            });
                          })
                          .catch((err) => {
                            console.log(err);
                            res.json({
                              status: "Failed",
                              message:
                                "An error occured while finalizing password reset",
                            });
                          });
                      })
                      .catch((err) => {
                        console.log(err);
                        res.json({
                          status: "Failed",
                          message: "Updating user password failed",
                        });
                      });
                  })
                  .catch((err) => {
                    console.log(err);
                    res.json({
                      status: "Failed",
                      message: "An error occured while hashing new password",
                    });
                  });
              } else {
                res.json({
                  status: "Failed",
                  message: "Invalid password reset details passed",
                });
              }
            })
            .catch((err) => {
              console.log(err);
              res.json({
                status: "Failed",
                message: "Comparing password reset string failed failed",
              });
            });
        }
      } else {
        res.json({
          status: "Failed",
          message: "Password reset request not found",
        });
      }
    })
    .catch((err) => {
      console.log(err);
      res.json({
        status: "Failed",
        message: "Checking for checking reset record failed",
      });
    });
});

//get user profile
router.get("/get-user-profile/:id", async (req, res) => {
  const userID = req.params.id;
  if (!userID) {
    res.json({
      status: "Failed",
      message: "User ID is missing",
    });
  } else {
    await User.findOne({ _id: userID }, "-password -verified")
      .then((response) => {
        if (response) {
          //user found
          res.send(response);
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
          message: "An error occured while getting user records",
        });
      });
  }
});

//edit profile
router.put("/update-profile/:id", async (req, res) => {
  const userID = req.params.id;
  let { password, email } = req.body;
  const filter = { _id: userID };

  //validate user
  if (!email || !password) {
    res.json({
      status: "Failed",
      message: "All fields are required",
    });
  } else {
    password = password.trim();
    email = email.trim();

    User.find({ email })
      .then((data) => {
        if (data.length) {
          const hashedPassword = data[0].password;
          bcrypt
            .compare(password, hashedPassword)
            .then(async (result) => {
              if (result) {
                await User.findOneAndUpdate(
                  filter,
                  {
                    firstName: req.body.firstName,
                    lastName: req.body.lastName,
                    profilePicture: req.body.profilePicture,
                  },
                  {
                    new: true,
                  }
                )
                  .then(() => {
                    res.json({
                      status: "Success",
                      message: "Profile updated successfully",
                    });
                  })
                  .catch((err) => {
                    console.log(err);
                    res.json({
                      status: "Failed",
                      message: "Error occured while updating user",
                    });
                  });
              } else {
                res.json({
                  status: "Failed",
                  message: "Invalid password",
                });
              }
            })
            .catch((err) => {
              console.log(err);
              res.json({
                status: "Failed",
                message: "Error occured while comparing passwords",
              });
            });
        } else {
          res.json({
            status: "Failed",
            message: "Invalid credentials entered",
          });
        }
      })
      .catch((err) => {
        res.json({
          status: "Failed",
          message: "Error occured checking existing user",
        });
      });
  }
});

//edit email
router.post("/edit-email/:id", async (req, res) => {
  const userID = req.params.id;
  let { newEmail, password } = req.body;

  newEmail = newEmail.trim();
  password = password.trim();

  //check if user exists
  await User.findOne({ _id: userID })
    .then(async (response) => {
      if (response) {
        //user found
        //confirm password
        const hashedPassword = response.password;
        bcrypt
          .compare(password, hashedPassword)
          .then(async (response) => {
            if (response) {
              //Check if email has been used
              await User.find({ email: newEmail })
                .then(async (response) => {
                  if (response.length > 0) {
                    //email exists
                    res.json({
                      status: "Failed",
                      message:
                        "Email provided has already been used. Try a different one",
                    });
                  } else {
                    //email doesnt exist
                    sendChangeEmailRequest({ userID, newEmail }, res);
                  }
                })
                .catch((err) => {
                  console.log(err);
                  res.json({
                    status: "Failed",
                    message: "Error occured while checking email records",
                  });
                });
            } else {
              //invalid pass
              res.json({
                status: "Failed",
                message: "Invalid password",
              });
            }
          })
          .catch((err) => {
            console.log(err);
            res.json({
              status: "Failed",
              message: "Error occured whilecomparing passwords",
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
        message: "Error occured while searching user",
      });
    });
});

//send change request
const sendChangeEmailRequest = ({ userID, newEmail }, res) => {
  const confirmationCode = Math.floor(1000 + Math.random() * 9000).toString();

  const mailOptions = {
    from: process.env.AUTH_EMAIL,
    to: newEmail,
    subject: "Verify your email",
    html: `<p>Hello,<br/>You've request an email change request.<br/>Here is your verification code: <h2>${confirmationCode}</h2><br/>The code expires in the next 1hr.</p>`,
  };

  const saltRounds = 10;
  bcrypt
    .hash(confirmationCode, saltRounds)
    .then(async (hashedConfirmationCode) => {
      const newEmailChange = new EmailChange({
        userID: userID,
        newEmail: newEmail,
        uniqueCode: hashedConfirmationCode,
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      //first check if there was a previous request
      await EmailChange.find({
        userID,
      })

        .then(async (response) => {
          if (response.length > 0) {
            //there were previous requests
            await EmailChange.deleteMany({
              userID,
            }).then(() => {
              newEmailChange
                .save()
                .then(() => {
                  transporter
                    .sendMail(mailOptions)
                    .then(() => {
                      res.json({
                        status: "Pending",
                        message:
                          "Verification email sent.Check your mailbox to verify new email",
                      });
                    })
                    .catch((err) => {
                      console.log(err);
                      res.json({
                        status: "Failed",
                        message: "Error occured sending verification email",
                      });
                    });
                })
                .catch((err) => {
                  console.log(err);
                  res.json({
                    status: "Failed",
                    message: "Couldn't save verification email data",
                  });
                });
            });
          } else {
            //noprevious req
            newEmailChange
              .save()
              .then(() => {
                transporter
                  .sendMail(mailOptions)
                  .then(() => {
                    res.json({
                      status: "Pending",
                      message:
                        "Verification email sent.Check your mailbox to verify new email",
                    });
                  })
                  .catch((err) => {
                    console.log(err);
                    res.json({
                      status: "Failed",
                      message: "Error occured sending verification email",
                    });
                  });
              })
              .catch((err) => {
                console.log(err);
                res.json({
                  status: "Failed",
                  message: "Couldn't save verification email data",
                });
              });
          }
        })
        .catch((err) => {
          console.log(err);
          res.json({
            status: "Failed",
            message: "Error occured checking email change records",
          });
        });
    })
    .catch((err) => {
      console.log(err);
      res.json({
        status: "Failed",
        message: "Error occured hashing email data",
      });
    });
};

//verify new email
router.post("/verify-new-email/:id", async (req, res) => {
  const userID = req.params.id;
  const { newEmail, secretCode } = req.body;
  //check if user exists
  await User.findOne({ _id: userID })
    .then(async (response) => {
      if (response) {
        //user found
        //check if change request exists
        await EmailChange.find({
          $and: [{ userID }, { newEmail }],
        })
          .then(async (response) => {
            if (response.length > 0) {
              //requestfound
              //check if it has expired
              const { newEmail, expiresAt } = response[0];

              const storedSecret = response[0].uniqueCode;

              if (expiresAt < Date.now()) {
                //Has expired
                //Delete record
                await EmailChange.deleteMany({
                  userID,
                })
                  .then(() => {
                    res.json({
                      status: "Failed",
                      message:
                        "The code you entered has expired. Please request another",
                    });
                  })
                  .catch((err) => {
                    console.log(err);
                    res.json({
                      status: "Failed",
                      message:
                        "An error occured while deleting outdated email change request records",
                    });
                  });
              } else {
                //not expired
                //check if code is correct
                await bcrypt
                  .compare(secretCode, storedSecret)
                  .then(async (response) => {
                    if (response) {
                      //matched

                      await User.findOneAndUpdate(
                        { _id: userID },
                        { email: newEmail }
                      )
                        .then(async () => {
                          //delete record
                          await EmailChange.deleteMany({
                            userID,
                          })
                            .then((response) => {
                              res.json({
                                status: "Success",
                                message: "Email updated successfully",
                              });
                            })
                            .catch((err) => {
                              console.log(err);
                              res.json({
                                status: "Failed",
                                message:
                                  "An error occured while deleting updated email change request",
                              });
                            });
                        })
                        .catch((err) => {
                          console.log(err);
                          res.json({
                            status: "Failed",
                            message: "An error occured while updating email",
                          });
                        });
                    } else {
                      res.json({
                        status: "Failed",
                        message: "Invalid code",
                      });
                    }
                  })
                  .catch((err) => {
                    console.log(err);
                    res.json({
                      status: "Failed",
                      message: "An error occured while comparing code",
                    });
                  });
              }
            } else {
              //request not found
              res.json({
                status: "Failed",
                message: "Email change request not found",
              });
            }
          })
          .catch((err) => {
            console.log(err);
            res.json({
              status: "Failed",
              message: "An error occured while getting email change records",
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
        message: "An error occured while getting user status",
      });
    });
});

//edit phone number
router.post("/edit-phone-number/:id", async (req, res) => {
  const { phoneNumber, password } = req.body;
  const userID = req.params.id;

  //check if user exists

  await User.findOne({ _id: userID })
    .then((response) => {
      if (response) {
        //user exists
        const hashedPassword = response.password;

        bcrypt
          .compare(password, hashedPassword)
          .then(async (response) => {
            if (response) {
              //correct pass
              //ensure no one has the new number

              User.find({ phoneNumber })
                .then(async (response) => {
                  if (response.length > 0) {
                    //number is registered
                    res.json({
                      status: "Failed",
                      message: "Phone number already registered. Use another",
                    });
                  } else {
                    //not registered
                    //change phone number
                    await User.updateOne(
                      { _id: userID },
                      { phoneNumber: phoneNumber }
                    )
                      .then(() => {
                        res.json({
                          status: "Success",
                          message: "Phone number updated successfully",
                        });
                      })
                      .catch((err) => {
                        console.log(err);
                        res.json({
                          status: "Failed",
                          message:
                            "Error occured while updating user phone number",
                        });
                      });
                  }
                })
                .catch((err) => {
                  console.log(err);
                  res.json({
                    status: "Failed",
                    message: "Error occured while checking existing records",
                  });
                });
            } else {
              //wrong password
              res.json({
                status: "Failed",
                message: "Incorrect password",
              });
            }
          })
          .catch((err) => {
            console.log(err);
            res.json({
              status: "Failed",
              message: "Error occured while comparing passwords",
            });
          });
      } else {
        //user doesnt exist
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
        message: "Error occured while checking user records",
      });
    });
});

module.exports = router;
