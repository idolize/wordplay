// Setup basic express server
const express = require('express');
const app = express();
const path = require('path');
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const Algorithmia = require("algorithmia");

const port = process.env.PORT || 3000;

const prompts = [
  'What is the meaning of life?',
  'Where do babies come from?',
  'What is God?',
  'How do I get rich quick?',
  'What happens after you die?',
  'What do dogs think about?',
  'How will I die?',
  'What\'s going to lead to the apocalpyse?',
  'How will our planet be saved?',
  'How do you find true love?',
  'What will be the future of transportation?',
  'What will be the future of entertainment?',
  'What are aliens like?',
  'How do I get the fountain of youth?',
  'How do I live forever?',
  'How can I become super strong?',
  'What is the best way to raise your kids?',
  'What will happen in my relationship?',
  'How do I get even with my boss?',
  'How do I become president?',
];

const selectPrompt = () => {
  return prompts[Math.floor(Math.random() * prompts.length)];
}

server.listen(port, () => {
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(path.join(__dirname, 'public')));

// Chatroom
let numUsers = 0;
let users = [];

let isDone = true;
let selectedPrompt = '';
let response = '';
let currentUser = undefined;

io.on('connection', (socket) => {
  let addedUser = false;

  const startGame = () => {
    if (numUsers < 3) {
      return;
    }
    isDone = false;
    selectedPrompt = selectPrompt();
    response = '';
    currentUser = users[Math.floor(Math.random() * numUsers)];
    console.log('game started - turn:', currentUser);
    io.emit('game started', {
      selectedPrompt,
      currentUser,
    });
  }

  const endGame = () => {
    numUsers = 0;
    users = [];
    isDone = true;
    selectedPrompt = '';
    response = '';
    currentUser = undefined;
    console.log('game ended - all users left');
  }

  socket.on('out of time', () => {
    io.emit('AI word start', {
      username: socket.username
    });
    if (!response.length) {
      var word = 'You';
      response = word;
      var userIndex = users.indexOf(socket.username);
      currentUser = users[numUsers === 0 ? 0 : (userIndex + 1) % numUsers];
      io.emit('add word', {
        username: '[AI BOT]',
        message: word,
        nextUser: currentUser,
      });
    } else {
      const fallback = 'uh';
      Algorithmia.client("sim5/+euZlm4p8fzBCnZcbEc9vh1")
        .algo("PetiteProgrammer/AutoComplete/0.1.2?timeout=20") // timeout is optional
        .pipe({ sentence: response })
        .then(aiResults => {
          if (isDone) {
            return;
          }
          console.log('aiResults', aiResults);
          var output = aiResults.get();
          var word = (output && output.length) ? output[Math.floor(Math.random() * output.length)].word : fallback;
          response += response.length ? ` ${word}` : word;
          var userIndex = users.indexOf(socket.username);
          currentUser = users[numUsers === 0 ? 0 : (userIndex + 1) % numUsers];
          io.emit('add word', {
            username: '[AI BOT]',
            message: word,
            nextUser: currentUser,
          });
        });
    }
  });

  // when the client emits 'add word', this listens and executes
  socket.on('add word', (word) => {
    word = word.replace(/\s/g, '');
    response += response.length ? ` ${word}` : word;
    var userIndex = users.indexOf(socket.username);
    currentUser = users[numUsers === 0 ? 0 : (userIndex + 1) % numUsers];
    io.emit('add word', {
      username: socket.username,
      message: word,
      nextUser: currentUser,
    });
  });

  socket.on('end response', () => {
    isDone = true;
    io.emit('end response', {
      username: socket.username,
      response,
    });
  });

  socket.on('new prompt', () => {
    startGame();
  });

  // when the client emits 'add user', this listens and executes
  socket.on('add user', (username) => {
    if (addedUser) return;
    if (users.indexOf(username) !== -1) {
      username = username + ' (1)';
    }

    ++numUsers;
    // we store the username in the socket session for this client
    socket.username = username;
    socket.userId = numUsers;
    users.push(username);
    addedUser = true;
    console.log('login:', currentUser, 'total:', numUsers);
    socket.emit('login', {
      numUsers: numUsers,
      isDone,
      selectedPrompt,
      response,
      currentUser,
    });

    // echo globally (all clients) that a person has connected
    socket.broadcast.emit('user joined', {
      username: socket.username,
      numUsers: numUsers
    });
  });

  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', () => {
    socket.broadcast.emit('typing', {
      username: socket.username
    });
  });

  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing', {
      username: socket.username
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', () => {
    if (addedUser) {
      var userIndex = users.indexOf(socket.username);
      users = users.filter(user => user !== socket.username);
      --numUsers;
      if (numUsers === 0) {
        // end game
        return endGame();
      }
      currentUser = users[(userIndex + 1) % numUsers];

      // echo globally that this client has left
      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers,
        currentUser
      });
    }
  });
});
