const https = require('https');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const passportSetup = require('./passport');
const passport = require('passport');
const fileUpload = require('express-fileupload');
const path = require('path');
const sequelize = require('./db/db');
const { User, Basket } = require('./models/models');
const router = require('./routes/index');
const errorHandler = require('./middleware/ErrorHandlingMiddleware');
const authRoute = require('./routes/authRoute');
const session = require('express-session');
const mongoose = require('mongoose');
const cookieSession = require('cookie-session');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const app = express();
const host = process.env.HOST;
const port = process.env.PORT;
const jwt = require('jsonwebtoken');
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, 'cert', 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'cert', 'cert.pem')),
};
const generateJwt = (id, email, role) => {
  return jwt.sign({ id, email, role }, process.env.SECRET_KEY, {
    expiresIn: '24h',
  });
};
app.use(express.json());
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));

app.set('trust proxy', 1);

app.use(
  session({
    secret: process.env.SECRET_KEY,
    resave: true,
    saveUninitialized: true,
    cookie: {
      sameSite: 'none',
      secure: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // One Week
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// app.use('/auth', authRoute);
app.use(express.static(path.resolve(__dirname, 'static')));
app.use(fileUpload({}));
app.use('/api', router);

app.use(errorHandler);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

passport.use(
  new GoogleStrategy(
    {
      clientID:
        '511696912407-d817vvjod2lctu1v8a8s66j964bqk4hg.apps.googleusercontent.com',
      clientSecret: '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',
      callbackURL: '/auth/google/callback',
      scope: ['profile', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails[0].value;

      try {
        const user = await User.findOne({ where: { email } });

        if (user) {
          // If user already exists, return user data without the password
          const userDataWithoutPassword = {
            id: user.id,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          };
          const jwtToken = generateJwt(user.id, user.email, user.role);
          done(null, { ...userDataWithoutPassword, token: jwtToken });
        } else {
          // If user doesn't exist, create a new user and return the data without the password
          const newUser = await User.create({ email });
          const basket = await Basket.create({ userId: newUser.id });
          const newUserWithoutPassword = {
            id: newUser.id,
            email: newUser.email,
            role: newUser.role,
            createdAt: newUser.createdAt,
            updatedAt: newUser.updatedAt,
          };
          const jwtToken = generateJwt(newUser.id, newUser.email, newUser.role);
          done(null, { ...newUserWithoutPassword, token: jwtToken });
        }
      } catch (error) {
        done(error);
      }
    }
  )
);

app.get('/auth/google', passport.authenticate('google'));

app.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: 'http://localhost:3000',
    session: true,
  }),
  function (req, res) {
    res.redirect('http://localhost:3000');
  }
);

app.get('/auth/logout', (req, res) => {
  try {
    req.session.destroy(err => {
      if (err) {
        console.error(err);
      }
    });
  } catch (err) {
    console.error(err);
  }
});

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.get('/getuser', (req, res) => {
  res.send(req.user);
});

const httpsServer = https.createServer(sslOptions, app);

const start = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    httpsServer.listen(port, host, () => {
      console.log(`Сервер работает на хосте ${httpsServer.address().address}`);
    });
  } catch (e) {
    console.error(e);
  }
};

start().then(() => console.log('Starting...'));
