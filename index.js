// Setup basic express server
const express = require('express');
const app = express();
const path = require('path');
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const Algorithmia = require('algorithmia');

const port = process.env.PORT || 3000;

const prompts = [
  'What is the meaning of life?',
  'Where do babies come from?',
  'How will <name> get rich?',
  'What happens after you die?',
  'What do dogs think about?',
  'How will <name> die?',
  'What\'s going to lead to the apocalpyse?',
  'How will our planet be saved?',
  'How will <name> find true love?',
  'What will be the future of transportation?',
  'What will be the future of entertainment?',
  'What are aliens like?',
  'How will <name> live forever?',
  'How will <name> become super strong?',
  'What is the best way to raise your kids?',
  'What will happen in <name>\'s relationship?',
  'How should <name> get even with their boss?',
  'How will <name> become president?',
  'What is <name>\'s deepest secret?',
  'What is the hardest problem in the world?',
  'What is <name>\'s best quality?',
  '<name> should be extra careful with...',
  '<name> always loves it when...',
  '<name> has a huge collection of...',
  'What did <name> find at the bottom of the rainbow?',
  'I am reading <name>\'s mind right now, and they are thinking about...',
];

server.listen(port, () => {
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(path.join(__dirname, 'public')));

// Chatroom
let numUsers = 0;
let users = [];
let wordbank = [];

let isDone = true;
let selectedPrompt = '';
let response = '';
let currentUser = undefined;

const selectPrompt = () => {
  const prompt = prompts[Math.floor(Math.random() * prompts.length)];
  const randPlayer = users[Math.floor(Math.random() * numUsers)];
  return prompt.replace(/<name>/g, randPlayer);
}

function getConnectedSockets() {
  return Object.values(io.of("/").connected);
}

const endGame = () => {
  numUsers = 0;
  users = [];
  wordbank = [];
  isDone = true;
  selectedPrompt = '';
  response = '';
  currentUser = undefined;
  getConnectedSockets().forEach(function (s) {
    s.disconnect(true);
  });
  console.log('game ended - all users left');
}

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
        .algo("PetiteProgrammer/AutoComplete/0.1.2?timeout=8") // timeout is optional
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
    if (currentUser !== socket.username) return;
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

  socket.on('add suggestion', (word) => {
    if (currentUser === socket.username) return;
    word = word.replace(/\s/g, '');
    if (wordbank.indexOf(word) === -1) {
      wordbank.push(word);
    }
    io.emit('add suggestion', {
      wordbank,
      word,
    });
  });

  socket.on('end response', () => {
    if (currentUser !== socket.username) return;
    isDone = true;
    io.emit('end response', {
      username: socket.username,
      response,
    });
  });

  socket.on('new prompt', () => {
    if (!isDone) return;
    startGame();
  });

  // when the client emits 'add user', this listens and executes
  socket.on('add user', (username) => {
    if (addedUser) return;

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
      wordbank,
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
      addedUser = false;
      var userIndex = users.indexOf(socket.username);
      users = users.filter(user => user !== socket.username);
      numUsers = numUsers < 1 ? 0 : (numUsers - 1);
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

app.get('/endgame', (req, res) => {
  endGame();
  res.send('Game ended');
});
