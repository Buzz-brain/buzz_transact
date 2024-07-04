const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const twilio = require('twilio');
const axios = require('axios');

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Failed to connect to MongoDB', err);
});

// Define the User schema
const userSchema = new mongoose.Schema({
    NIN: String,
    name: String,
    phoneNumber: String,
    accNumber: String,
    balance: Number,
});

const User = mongoose.model('User', userSchema);

// Handle SMS commands
app.post('/sms', async (req, res) => {
    const { Body, From } = req.body;
    const message = Body.trim();

    try {
        if (message.startsWith('REGISTER ')) {
            const NIN = message.split(' ')[1];
            const response = await axios.get(`https://buzz-nin-api.vercel.app/nimc/${NIN}`);
            const userDetails = response.data;

            const newUser = new User({
                NIN: userDetails.NIN,
                name: userDetails.name,
                phoneNumber: From,
                accNumber: userDetails.NIN,
                balance: 10000,
            });

            await newUser.save();

            await client.messages.create({
                body: `Welcome ${userDetails.name}, You have successfully created an account with us. Your account number is ${userDetails.NIN} and your account has been created with a balance of #10,000. Thank you for choosing our bank`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: From,
            });

            console.log(`Welcome ${userDetails.name}, You have successfully created an account with us. Your account number is ${userDetails.NIN} and your account has been created with a balance of #10,000. Thank you for choosing our bank`)
            res.send({message: `Welcome ${userDetails.name}, You have successfully created an account with us. Your account number is ${userDetails.NIN} and your account has been created with a balance of #10,000. Thank you for choosing our bank`});
        } else if (message === 'BALANCE') {
            const user = await User.findOne({ phoneNumber: From });

            if (user) {
                console.log(user.balance.toFixed(2))
                await client.messages.create({
                    body: `Your current balance is #${user.balance.toFixed(2)}`,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: From,
                });
            } else {
                await client.messages.create({
                    body: 'User not found. Please register first.',
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: From,
                });
            }

            res.send({message: `Your current balance is #${user.balance.toFixed(2)}`});
        } else if (message.startsWith('TRANSFER ')) {
            const [_, amount, accNumber] = message.split(' ');

            const sender = await User.findOne({ phoneNumber: From });
            const recipient = await User.findOne({ accNumber: accNumber });

            console.log(sender)

            if (sender && recipient && sender.balance >= parseFloat(amount)) {
                sender.balance -= parseFloat(amount);
                recipient.balance += parseFloat(amount);

                await sender.save();
                await recipient.save();

                await client.messages.create({
                    body: `You have transferred #${parseFloat(amount).toFixed(2)} to ${recipient.name}. Your new balance is #${sender.balance.toFixed(2)}`,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: From,
                });

                // await client.messages.create({
                //     body: `You have received #${parseFloat(amount).toFixed(2)} from ${sender.name}. Your new balance is #${recipient.balance.toFixed(2)}`,
                //     from: process.env.TWILIO_PHONE_NUMBER,
                //     to: recipient.phoneNumber,
                // });

                console.log(`You have transferred #${parseFloat(amount).toFixed(2)} to ${recipient.name}. Your new balance is #${sender.balance.toFixed(2)}`)
                console.log(`You have received #${parseFloat(amount).toFixed(2)} from ${sender.name}. Your new balance is #${recipient.balance.toFixed(2)}`)
                
                res.send([{senderMessage: `You have transferred #${parseFloat(amount).toFixed(2)} to ${recipient.name}. Your new balance is #${sender.balance.toFixed(2)}`}, {recepientMessage: `You have received #${parseFloat(amount).toFixed(2)} from ${sender.name}. Your new balance is #${recipient.balance.toFixed(2)}`}]);
            } else {
                await client.messages.create({
                    body: 'Transfer failed. Please check your balance and try again.',
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: From,
                });
                res.status(400).json({ message: 'Transfer failed. Insufficient balance or invalid recipient.' });
            }
        } else {
            await client.messages.create({
                body: 'Invalid command. Please try again.',
                from: process.env.TWILIO_PHONE_NUMBER,
                to: From,
            });
            res.status(400).json({ message: 'Invalid command' });
        }
    } catch (error) {
        console.error('Error processing request:', error);
        await client.messages.create({
            body: 'An error occurred. Please try again.',
            from: process.env.TWILIO_PHONE_NUMBER,
            to: From,
        });
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});

// Handle other SMS commands here

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
