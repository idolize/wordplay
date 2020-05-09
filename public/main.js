$(function () {
  var TURN_TIME_S = 10;
  var FADE_TIME = 150; // ms
  var TYPING_TIMER_LENGTH = 400; // ms
  var COLORS = [
    '#e21400', '#91580f', '#f8a700', '#f78b00',
    '#58dc00', '#287b00', '#a8f07a', '#4ae8c4',
    '#3b88eb', '#3824aa', '#a700ff', '#d300e7'
  ];

  // Initialize variables
  var $window = $(window);
  var $message = $('.messageData');
  var $usernameInput = $('.usernameInput'); // Input for username
  var $messages = $('.messages'); // Messages area
  var $inputMessage = $('.inputMessage input'); // Input message input box
  var $inputSend = $('#send');
  var $inputEnd = $('#end'); // Input message input box

  var $loginPage = $('.login.page'); // The login page
  var $chatPage = $('.chat.page'); // The chatroom page

  var $playBtn = $('#play');
  var $timer = $('#timer');

  // Prompt for setting a username
  var username;
  var connected = false;
  var typing = false;
  var lastTypingTime;
  var $currentInput = $usernameInput.focus();
  var currentUser;
  var isDone = true;
  var numUsers = 0;

  var turnTimer;
  var turnTime = TURN_TIME_S;

  var socket = io();

  const addParticipantsMessage = (data) => {
    var message = '';
    if (data.numUsers === 1) {
      message += "there's 1 participant";
    } else {
      message += "there are " + data.numUsers + " participants";
    }
    numUsers = data.numUsers;
    log(message);
  }

  // Sets the client's username
  const setUsername = () => {
    username = cleanInput($usernameInput.val().trim());

    // If the username is valid
    if (username) {
      $loginPage.fadeOut();
      $chatPage.attr("style", "display: flex;")
      $loginPage.off('click');
      $currentInput = $inputMessage.focus();

      // Tell the server your username
      socket.emit('add user', username);
    }
  }

  // Sends a chat message
  const sendMessage = () => {
    socket.emit('stop typing');
    typing = false;
    if ($inputMessage.prop('disabled')) return;
    var message = $inputMessage.val();
    // Prevent markup from being injected into the message
    message = cleanInput(message);
    // if there is a non-empty message and a socket connection
    if (message && connected) {
      $inputMessage.val('');
      // addChatMessage({
      //   username: username,
      //   message: message
      // });
      // addWord(message);
      // tell server to execute 'new message' and send along one parameter
      socket.emit('add word', message);
    }
  }

  // Log a message
  const log = (message, options) => {
    var $el = $('<li>').addClass('log').text(message);
    addMessageElement($el, options);
  }

  // Adds the visual chat message to the message list
  const addChatMessage = (data, options) => {
    // Don't fade the message in if there is an 'X was typing'
    var $typingMessages = getTypingMessages(data);
    options = options || {};
    if ($typingMessages.length !== 0) {
      options.fade = false;
      $typingMessages.remove();
    }

    var $usernameDiv = $('<span class="username"/>')
      .text(data.username)
      .css('color', getUsernameColor(data.username));
    var $messageBodyDiv = $('<span class="messageBody">')
      .text(data.outOfTime ? 'ran out of time' :
        data.typing ? 'is typing...' :
        data.message ? `wrote '${data.message}'` :
        `ended the response! The final asnwer is '${data.response}'`);

    var typingClass = data.typing ? 'typing' : '';
    var $messageDiv = $('<li class="message"/>')
      .data('username', data.username)
      .addClass(typingClass)
      .append($usernameDiv, $messageBodyDiv);

    addMessageElement($messageDiv, options);
  }

  const addWord = (word) => {
    $message.text($message.text() + ' ' + word);
  }

  // Adds the visual chat typing message
  const addChatTyping = (data) => {
    data.typing = true;
    data.message = 'is typing';
    addChatMessage(data);
  }

  // Removes the visual chat typing message
  const removeChatTyping = (data) => {
    getTypingMessages(data).fadeOut(function () {
      $(this).remove();
    });
  }

  // Adds a message element to the messages and scrolls to the bottom
  // el - The element to add as a message
  // options.fade - If the element should fade-in (default = true)
  // options.prepend - If the element should prepend
  //   all other messages (default = false)
  const addMessageElement = (el, options) => {
    var $el = $(el);

    // Setup default options
    if (!options) {
      options = {};
    }
    if (typeof options.fade === 'undefined') {
      options.fade = true;
    }
    if (typeof options.prepend === 'undefined') {
      options.prepend = false;
    }

    // Apply options
    if (options.fade) {
      $el.hide().fadeIn(FADE_TIME);
    }
    if (options.prepend) {
      $messages.prepend($el);
    } else {
      $messages.append($el);
    }
    $messages[0].scrollTop = $messages[0].scrollHeight;
  }

  // Prevents input from having injected markup
  const cleanInput = (input) => {
    return $('<div/>').text(input).html();
  }

  // Updates the typing event
  const updateTyping = () => {
    if (connected) {
      if (!typing) {
        typing = true;
        socket.emit('typing');
      }
      lastTypingTime = (new Date()).getTime();

      setTimeout(() => {
        var typingTimer = (new Date()).getTime();
        var timeDiff = typingTimer - lastTypingTime;
        if (timeDiff >= TYPING_TIMER_LENGTH && typing) {
          socket.emit('stop typing');
          typing = false;
        }
      }, TYPING_TIMER_LENGTH);
    }
  }

  // Gets the 'X is typing' messages of a user
  const getTypingMessages = (data) => {
    return $('.typing.message').filter(function (i) {
      return $(this).data('username') === data.username;
    });
  }

  // Gets the color of a username through our hash function
  const getUsernameColor = (username) => {
    // Compute hash code
    var hash = 7;
    for (var i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + (hash << 5) - hash;
    }
    // Calculate color
    var index = Math.abs(hash % COLORS.length);
    return COLORS[index];
  }

  const enableTurnTimer = (yourTurn) => {
    clearTimeout(turnTimer);
    turnTime = TURN_TIME_S;

    const tick = () => {
      turnTimer = setTimeout(() => {
        turnTime--;
        console.log(`${turnTime}s left...`);
        $timer.text(`${turnTime}s`);
        if (turnTime === 0) {
          console.log('Ran out of time');
          socket.emit('out of time');
          $timer.text('Out of time!');
          $inputMessage.prop('disabled', true);
          $inputSend.prop('disabled', true);
          $inputEnd.prop('disabled', true);
        } else {
          console.log(`${turnTime}s left...`);
          tick();
        }
      }, 1000); // 5 sec
    };

    if (yourTurn) {
      $timer.text(`${turnTime}s`);
      $timer.show();
      tick();
    } else {
      $timer.hide();
    }
  }

  // Keyboard events

  $window.keydown(event => {
    // Auto-focus the current input when a key is typed
    if (!(event.ctrlKey || event.metaKey || event.altKey)) {
      $currentInput.focus();
    }
    // When the client hits ENTER on their keyboard
    if (event.which === 13) {
      if (username) {
        sendMessage();
      } else {
        setUsername();
      }
    }
  });

  $inputMessage.on('input', () => {
    updateTyping();
  });

  $inputMessage.keydown((e) => {
    if (e.keyCode == 32) {
      return false;
    }
  });

  // Click events
  $('#usernameDone').click(() => {
    var e = jQuery.Event('keydown');
    e.which = 13; //choose the one you want
    e.keyCode = 13;
    $window.trigger(e);
  })

  $inputSend.click(() => {
    sendMessage();
  });

  // Focus input when clicking anywhere on login page
  $loginPage.click(() => {
    $currentInput.focus();
  });

  // Focus input when clicking on the message input's border
  $('.messageArea').click(() => {
    $inputMessage.focus();
  });

  $playBtn.click(() => {
    if (numUsers < 3) {
      alert('You need at least three people to play');
      return;
    }
    $playBtn.hide();
    socket.emit('new prompt');
  });

  $inputEnd.click(() => {
    if (confirm('Are you sure you want to end the response as-is?')) {
      socket.emit('end response');
      $inputMessage.hide();
      $inputSend.hide();
      $inputEnd.hide();
    }
  });

  // Socket events

  // Whenever the server emits 'login', log the login message
  socket.on('login', (data) => {
    isDone = data.isDone;
    if (isDone) {
      $playBtn.show();
      $inputMessage.hide();
      $inputSend.hide();
      $inputEnd.hide();
    }
    $('.prompt').text(data.selectedPrompt);
    currentUser = data.currentUser;
    var yourTurn = !isDone && currentUser === username;
    if (yourTurn) {
      $inputMessage.prop('placeholder', 'Type the next word');
      $inputMessage.focus();
    } else if (!isDone && currentUser) {
      $inputMessage.prop('placeholder', `${currentUser}'s turn`);
    }
    $message.text(data.response);
    $inputSend.prop('disabled', !yourTurn);
    $inputEnd.prop("disabled", !yourTurn || !$message.text().length);
    $inputMessage.prop("disabled", !yourTurn);
    enableTurnTimer(yourTurn);

    connected = true;
    // Display the welcome message
    var message = "Welcome to Wordplay – ";
    log(message, {
      prepend: true
    });
    addParticipantsMessage(data);
  });

  socket.on('AI word start', (data) => {
    addChatMessage({ ...data, outOfTime: true });
    $inputMessage.prop('placeholder', 'AI BOT generating word...');
  });

  socket.on('add word', (data) => {
    addChatMessage(data);
    addWord(data.message);
    currentUser = data.nextUser;
    var yourTurn = currentUser === username;
    if (yourTurn) {
      $inputMessage.prop('placeholder', 'Type the next word');
      $inputMessage.focus();
    } else if (currentUser) {
      $inputMessage.prop('placeholder', `${currentUser}'s turn`);
    }
    $inputSend.prop('disabled', !yourTurn);
    $inputEnd.prop("disabled", !yourTurn || !$message.text().length);
    $inputMessage.prop("disabled", !yourTurn);
    enableTurnTimer(yourTurn);
  });

  socket.on('end response', (data) => {
    addChatMessage(data);
    isDone = true;
    currentUser = undefined;
    $inputMessage.hide();
    $inputSend.hide();
    $inputEnd.hide();
    $playBtn.show();
    enableTurnTimer(false);
  });

  // Whenever the server emits 'user joined', log it in the chat body
  socket.on('user joined', (data) => {
    log(data.username + ' joined');
    addParticipantsMessage(data);
  });

  // Whenever the server emits 'user left', log it in the chat body
  socket.on('user left', (data) => {
    log(data.username + ' left');
    addParticipantsMessage(data);
    removeChatTyping(data);
    if (!isDone && data.currentUser !== currentUser) {
      currentUser = data.currentUser;
      var yourTurn = currentUser === username;
      if (yourTurn) {
        $inputMessage.prop('placeholder', 'Type the next word');
        $inputMessage.focus();
      } else if (currentUser) {
        $inputMessage.prop('placeholder', `${currentUser}'s turn`);
      }
      $inputMessage.prop("disabled", !yourTurn);
      $inputEnd.prop("disabled", !yourTurn || !$message.text().length);
      enableTurnTimer(yourTurn);
    }
  });

  socket.on('game started', (data) => {
    $playBtn.hide();
    $inputMessage.show();
    $inputSend.show();
    $inputEnd.show();
    console.log('game started', data);
    $('.prompt').text(data.selectedPrompt);
    currentUser = data.currentUser;
    $message.text('');
    isDone = false;
    var yourTurn = currentUser === username;
    if (yourTurn) {
      $inputMessage.prop('placeholder', 'Type the next word');
      $inputMessage.focus();
    } else if (currentUser) {
      $inputMessage.prop('placeholder', `${currentUser}'s turn`);
    }
    $inputMessage.prop("disabled", !yourTurn);
    $inputSend.prop('disabled', !yourTurn);
    $inputEnd.prop("disabled", !yourTurn || !$message.text().length);
    enableTurnTimer(yourTurn);
  });

  // Whenever the server emits 'typing', show the typing message
  socket.on('typing', (data) => {
    addChatTyping(data);
  });

  // Whenever the server emits 'stop typing', kill the typing message
  socket.on('stop typing', (data) => {
    removeChatTyping(data);
  });

  socket.on('disconnect', () => {
    log('you have been disconnected');
  });

  socket.on('reconnect', () => {
    log('you have been reconnected');
    if (username) {
      socket.emit('add user', username);
    }
  });

  socket.on('reconnect_error', () => {
    log('attempt to reconnect has failed');
  });

});
