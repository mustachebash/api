/**
 * Email service for sending transactional emails
 * @type {Object}
 */

const crypto = require('crypto'),
	config = require('../config'),
	log = require('../utils/log'),
	mailgun = require('mailgun-js')({apiKey: config.mailgun.apiKey, domain: config.mailgun.domain}),
	MailChimpClient = require('mailchimp-api-v3');

const mailchimp = new MailChimpClient(config.mailchimp.apiKey),
	md5 = string => crypto.createHash('md5').update(string).digest('hex');

/* eslint-disable max-len */
module.exports = {
	/**
	 * This will upsert a member into a list with first and last names, subscribe by default (but leave existing statuses in place)
	 * then apply all tags listed
	 * @param  {string}  listId    Mailchimp list id
	 * @param  {string}  email     subscriber email
	 * @param  {string}  firstName subscriber first name
	 * @param  {string}  lastName  subscriber last name
	 * @param  {Array}   [tags=[] string }]   tags to apply to member
	 * @return {Promise}
	 */
	async upsertEmailSubscriber(listId, { email, firstName, lastName, tags = [] }) {
		const memberHash = md5(email.toLowerCase());

		try {
			await mailchimp.put(`/lists/${listId}/members/${memberHash}`, {
				email_address: email,
				status_if_new: 'subscribed',
				merge_fields: {
					FNAME: firstName,
					LNAME: lastName
				}
			});

			if(tags.length) {
				await mailchimp.post(`/lists/${listId}/members/${memberHash}/tags`, {
					tags: tags.map(tag => ({name: tag, status: 'active'}))
				});
			}

			log.info({email, listId}, 'Email successfully added to list');
		} catch(e) {
			log.error({err: e, listId, email}, 'Failed to add email to MailChimp list');
		}
	},

	sendReceipt(guestFirstName, guestLastName, guestEmail, confirmation, transactionToken, amount) {
		mailgun.messages().send({
			from: 'Mustache Bash Tickets <contact@mustachebash.com>',
			to: guestFirstName + ' ' + guestLastName + ' <' + guestEmail + '> ',
			subject: 'Mustache Bash 2022 - Your Ticket Order - Confirmation ' + confirmation,
			html: `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>The Mustache Bash Confirmation</title>
    <style>
@media only screen and (max-width: 620px) {
  table[class=body] h1 {
    font-size: 28px !important;
    margin-bottom: 10px !important;
  }

  table[class=body] p,
table[class=body] ul,
table[class=body] ol,
table[class=body] td,
table[class=body] span,
table[class=body] a {
    font-size: 16px !important;
  }

  table[class=body] .wrapper,
table[class=body] .article {
    padding: 10px !important;
  }

  table[class=body] .content {
    padding: 0 !important;
  }

  table[class=body] .container {
    padding: 0 !important;
    width: 100% !important;
  }

  table[class=body] .main {
    border-left-width: 0 !important;
    border-radius: 0 !important;
    border-right-width: 0 !important;
  }

  table[class=body] .btn table {
    width: 100% !important;
  }

  table[class=body] .btn a {
    width: 100% !important;
  }

  table[class=body] .img-responsive {
    height: auto !important;
    max-width: 100% !important;
    width: auto !important;
  }
}
@media all {
  .ExternalClass {
    width: 100%;
  }

  .ExternalClass,
.ExternalClass p,
.ExternalClass span,
.ExternalClass font,
.ExternalClass td,
.ExternalClass div {
    line-height: 100%;
  }
}
</style>
  </head>
  <body class="" style="background-color: #f6f6f6; font-family: sans-serif; -webkit-font-smoothing: antialiased; font-size: 14px; line-height: 1.4; margin: 0; padding: 0; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="body" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #f6f6f6; width: 100%;" width="100%" bgcolor="#f6f6f6">
      <tr>
        <td style="font-family: sans-serif; font-size: 14px; vertical-align: top;" valign="top">&nbsp;</td>
        <td class="container" style="font-family: sans-serif; font-size: 14px; vertical-align: top; display: block; max-width: 580px; padding: 10px; width: 580px; margin: 0 auto;" width="580" valign="top">
          <div class="content" style="box-sizing: border-box; display: block; margin: 0 auto; max-width: 580px; padding: 10px;">

            <!-- START CENTERED WHITE CONTAINER -->
            <span class="preheader" style="color: transparent; display: none; height: 0; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all; visibility: hidden; width: 0;">The Mustache Bash - Confirmation #${confirmation}. Thanks so much for your ticket order!</span>
            <table role="presentation" class="main" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; background: #ffffff; border-radius: 3px; width: 100%;" width="100%">

              <!-- START MAIN CONTENT AREA -->
              <tr>
                <td class="wrapper" style="font-family: sans-serif; font-size: 14px; vertical-align: top; box-sizing: border-box; padding: 20px;" valign="top">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%;" width="100%">
                    <tr>
                        <td class="align-center" style="font-family: sans-serif; font-size: 14px; vertical-align: top; text-align: center;" valign="top" align="center">
                            <img src="https://mustachebash.com/img/fro-man-navy.png" alt="The Mustache Bash" style="border: none; -ms-interpolation-mode: bicubic; max-width: 100%;">
                        </td>
                    </tr>
                    <tr>
                        <td class="align-center" style="font-family: sans-serif; font-size: 14px; vertical-align: top; text-align: center;" valign="top" align="center">
                            &nbsp;
                        </td>
                    </tr>
                    <tr>
                      <td style="font-family: sans-serif; font-size: 14px; vertical-align: top;" valign="top">
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Hi ${guestFirstName}! Thanks so much for your ticket order. Details are below.</p>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
                            <strong>Confirmation Number:</strong> ${confirmation}<br>
        					<strong>Total:</strong> $${amount}
                        </p>
						<p style="font-family: sans-serif; font-size: 18px; font-weight: normal; margin: 0; margin-bottom: 15px;">
                            <strong><a style="color: #0e2245;" href="https://mustachebash.com/mytickets?t=${transactionToken}">View Tickets</a></strong>
                        </p>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">We're excited to have you at the 2022 Mustache Bash! Keep this confirmation email for your records. Be sure to bring your tickets and a photo ID for each guest to get in and pick up your wristband at willcall. Do not forward this email or share your tickets link with anyone.</p>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">If you have any questions regarding your purchase, feel free to reply to this email. Thanks and see you at the Bash!</p>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
                            Sincerely,<br>
        				    Team Mustache Bash
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            <!-- END MAIN CONTENT AREA -->
            </table>

            <!-- START FOOTER -->
            <div class="footer" style="clear: both; margin-top: 10px; text-align: center; width: 100%;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%;" width="100%">
                <tr>
                  <td class="content-block" style="font-family: sans-serif; vertical-align: top; padding-bottom: 10px; padding-top: 10px; color: #999999; font-size: 12px; text-align: center;" valign="top" align="center">
                    <span style="color: #999999; font-size: 12px; text-align: center;"><a href="https://mustachebash.com">The Mustache Bash</a></span>
                  </td>
                </tr>
              </table>
            </div>
            <!-- END FOOTER -->

          <!-- END CENTERED WHITE CONTAINER -->
          </div>
        </td>
        <td style="font-family: sans-serif; font-size: 14px; vertical-align: top;" valign="top">&nbsp;</td>
      </tr>
    </table>
  </body>
</html>
			`
		})
			.then(mailgunResponse => log.info({mailgunResponse, guestEmail, confirmation}, 'Receipt email sent'))
			.catch(err => log.error({err, guestEmail, confirmation}, 'Receipt email failed to send'));
	},

	sendTransfereeConfirmation(transfereeFirstName, transfereeLastName, transfereeEmail, originalTransactionId, transactionToken) {
		mailgun.messages().send({
			from: 'Mustache Bash Tickets <contact@mustachebash.com>',
			to: transfereeFirstName + ' ' + transfereeLastName + ' <' + transfereeEmail + '> ',
			subject: 'Mustache Bash 2022 - Your Tickets - Transfer Confirmation ' + originalTransactionId.substring(0, 8),
			html: `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>The Mustache Bash Transfer Confirmation</title>
    <style>
@media only screen and (max-width: 620px) {
  table[class=body] h1 {
    font-size: 28px !important;
    margin-bottom: 10px !important;
  }

  table[class=body] p,
table[class=body] ul,
table[class=body] ol,
table[class=body] td,
table[class=body] span,
table[class=body] a {
    font-size: 16px !important;
  }

  table[class=body] .wrapper,
table[class=body] .article {
    padding: 10px !important;
  }

  table[class=body] .content {
    padding: 0 !important;
  }

  table[class=body] .container {
    padding: 0 !important;
    width: 100% !important;
  }

  table[class=body] .main {
    border-left-width: 0 !important;
    border-radius: 0 !important;
    border-right-width: 0 !important;
  }

  table[class=body] .btn table {
    width: 100% !important;
  }

  table[class=body] .btn a {
    width: 100% !important;
  }

  table[class=body] .img-responsive {
    height: auto !important;
    max-width: 100% !important;
    width: auto !important;
  }
}
@media all {
  .ExternalClass {
    width: 100%;
  }

  .ExternalClass,
.ExternalClass p,
.ExternalClass span,
.ExternalClass font,
.ExternalClass td,
.ExternalClass div {
    line-height: 100%;
  }
}
</style>
  </head>
  <body class="" style="background-color: #f6f6f6; font-family: sans-serif; -webkit-font-smoothing: antialiased; font-size: 14px; line-height: 1.4; margin: 0; padding: 0; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="body" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #f6f6f6; width: 100%;" width="100%" bgcolor="#f6f6f6">
      <tr>
        <td style="font-family: sans-serif; font-size: 14px; vertical-align: top;" valign="top">&nbsp;</td>
        <td class="container" style="font-family: sans-serif; font-size: 14px; vertical-align: top; display: block; max-width: 580px; padding: 10px; width: 580px; margin: 0 auto;" width="580" valign="top">
          <div class="content" style="box-sizing: border-box; display: block; margin: 0 auto; max-width: 580px; padding: 10px;">

            <!-- START CENTERED WHITE CONTAINER -->
            <span class="preheader" style="color: transparent; display: none; height: 0; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all; visibility: hidden; width: 0;">The Mustache Bash - Confirmation #${originalTransactionId.substring(0, 8)}. Thanks so much for your ticket order!</span>
            <table role="presentation" class="main" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; background: #ffffff; border-radius: 3px; width: 100%;" width="100%">

              <!-- START MAIN CONTENT AREA -->
              <tr>
                <td class="wrapper" style="font-family: sans-serif; font-size: 14px; vertical-align: top; box-sizing: border-box; padding: 20px;" valign="top">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%;" width="100%">
                    <tr>
                        <td class="align-center" style="font-family: sans-serif; font-size: 14px; vertical-align: top; text-align: center;" valign="top" align="center">
                            <img src="https://mustachebash.com/img/fro-man-navy.png" alt="The Mustache Bash" style="border: none; -ms-interpolation-mode: bicubic; max-width: 100%;">
                        </td>
                    </tr>
                    <tr>
                        <td class="align-center" style="font-family: sans-serif; font-size: 14px; vertical-align: top; text-align: center;" valign="top" align="center">
                            &nbsp;
                        </td>
                    </tr>
                    <tr>
                      <td style="font-family: sans-serif; font-size: 14px; vertical-align: top;" valign="top">
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Hi ${transfereeFirstName}! Thanks so much for getting tickets to the Bash. Details are below.</p>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
                            <strong>Transfer Confirmation Number:</strong> ${originalTransactionId.substring(0, 8)}<br>
                        </p>
						<p style="font-family: sans-serif; font-size: 18px; font-weight: normal; margin: 0; margin-bottom: 15px;">
                            <strong><a style="color: #0e2245;" href="https://mustachebash.com/mytickets?t=${transactionToken}">View Tickets</a></strong>
                        </p>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">We're excited to have you at the 2022 Mustache Bash! Keep this confirmation email for your records. Be sure to bring your tickets and a photo ID for each guest to get in and pick up your wristband at willcall. Do not forward this email or share your tickets link with anyone.</p>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">If you have any questions regarding your purchase, feel free to reply to this email. Thanks and see you at the Bash!</p>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
                            Sincerely,<br>
        				    Team Mustache Bash
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            <!-- END MAIN CONTENT AREA -->
            </table>

            <!-- START FOOTER -->
            <div class="footer" style="clear: both; margin-top: 10px; text-align: center; width: 100%;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%;" width="100%">
                <tr>
                  <td class="content-block" style="font-family: sans-serif; vertical-align: top; padding-bottom: 10px; padding-top: 10px; color: #999999; font-size: 12px; text-align: center;" valign="top" align="center">
                    <span style="color: #999999; font-size: 12px; text-align: center;"><a href="https://mustachebash.com">The Mustache Bash</a></span>
                  </td>
                </tr>
              </table>
            </div>
            <!-- END FOOTER -->

          <!-- END CENTERED WHITE CONTAINER -->
          </div>
        </td>
        <td style="font-family: sans-serif; font-size: 14px; vertical-align: top;" valign="top">&nbsp;</td>
      </tr>
    </table>
  </body>
</html>
			`
		})
			.then(mailgunResponse => log.info({mailgunResponse, transfereeEmail, originalTransactionId}, 'Transferee email sent'))
			.catch(err => log.error({err, transfereeEmail, originalTransactionId}, 'Transferee email failed to send'));
	}
};
/* eslint-enable */
