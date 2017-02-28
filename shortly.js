var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var environment = require('./env/environment');
var sodium = require('sodium').api;
var Promise = require('bluebird');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();


app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

app.use(session({
  secret: environment.sessionSecret,
  resave: false, // don't save session if unmodified
  saveUninitialized: false // don't create session until something stored
}));

app.get('/',
util.checkUser,
function(req, res) {
  res.render('index');
});

app.get('/create',
util.checkUser,
function(req, res) {
  res.render('index');
});

app.get('/links',
util.checkUser,
function(req, res) {
  Links.reset().fetch().then(links => {
    res.status(200).send(links.models);
  });
});

app.post('/links',
util.checkUser,
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(found => {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, (err, title) => {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(newLink => {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  var username = req.body.username;
  var plaintext = req.body.password; // user input

  var loginAs = new User({ username: username })
    .fetch()
    .then(user => {
      if (!user) {
        return Promise.reject('User does not exist');
      }
      var hash = user.get('password'); // from database
      if (!util.verifyPassword(hash, plaintext)) {
        return Promise.reject('Wrong password');
      }
      return Promise.resolve(user);
    });

  var newSession = Promise.promisify(req.session.regenerate);

  Promise.join(loginAs, newSession, (user) => {
    req.session.user = user.id;
    res.redirect('/');
  })
  .catch(error => {
    console.log('Failed to log in\n', error);
    res.send(401, 'Invalid username or password');
  });

});

app.get('/signup', (req, res) => {
  res.render('signup');
});

app.post('/signup', (req, res) => {
  var username = req.body.username;
  var plaintext = req.body.password;
  var hash = util.hashPassword(plaintext);

  var newUser = new User({username: username})
    .fetch()
    .then(function(found) {
      if (found) {
        return Promise.reject('Username already taken.');
      }
      return Users.create({
        'username': username,
        'password': hash
      });
    })

  var newSession = Promise.promisify(req.session.regenerate);

  Promise.join(newUser, newSession, (user) => {
    req.session.user = user.id;
    res.redirect('/');
  })
  .catch(error => {
    console.log('Failed to create account\n', error);
    res.send(409, error);
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', (req, res) => {
  new Link({ code: req.params[0] }).fetch().then( link => {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(() => {
        link.set('visits', link.get('visits') + 1);
        link.save().then(() => {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

module.exports = app;
