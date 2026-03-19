// test-review.js  — intentionally bad code for testing

const express = require('express')
const app = express()
const mongoose = require('mongoose')

// Bad: hardcoded credentials
mongoose.connect('mongodb://admin:password123@localhost:27017/mydb')

// Bad: no input validation, SQL-injection style thinking
app.get('/user', (req, res) => {
  const query = { name: req.query.name }  // no sanitization
  User.find(query).then(users => res.json(users))
})

// Bad: password stored in plain text
app.post('/register', (req, res) => {
  const user = new User({
    email: req.body.email,
    password: req.body.password  // should be hashed
  })
  user.save()
})

// Bad: no error handling, no response on failure
app.listen(3000)