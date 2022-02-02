var nodemailer = require('nodemailer');

const userEmail = {
    user: process.env.NODEMAILER_EMAIL,
    pass: process.env.NODEMAILER_PASSWORD
};

var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: userEmail
});

const SendEmail = (mailOptions) => {
    return new Promise(async (resolve, reject) => {
        try {
            var sendMailInfo = await transporter.sendMail(
                {
                    from: userEmail.user,
                    to: mailOptions.emailRecipients,
                    cc: mailOptions.emailCc,
                    subject: mailOptions.emailSubject,
                    text: mailOptions.emailBody
                }
            );
            resolve({ success: true, data: sendMailInfo });
        }
        catch (error) {
            console.log('error =>', error)
            reject({ success: false, error: error });
        }
    })
}

module.exports = SendEmail;