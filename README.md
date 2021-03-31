# agar.io-clone

# Online Multiplayer Game

# deployed @ https://agario-clone-aman.herokuapp.com/

Tech used: Frontend: Javascript, Backend: NodeJS, Express, SocketIO for real time communication b/w players and the server.

To install:

1. Run "npm install" then "node index.js" to start the server.
2. The game runs on the local network the computer is connected to on port 8080.
3. You can access the game on any device connected to the network by going the [IP Adress]:8080 address.

## **About the approach and Inspiration:**

This project is a really fun way to display the power and versatility of **Web Socket based communication.** Web Sockets are different from **AJAX **requests. In traditional AJAX requests (you might have encountered these in the form of **GET**, **POST**, **PUT **requests for a **REST API**) the communication link between the server and the Client disconnects after completion of the request (like when you receive a status code 200, 404 etc.). In contrast, in Web Socket based communication, the client and server remain connected.
This helps in cases when you require real time communication happening! A widely used example is the notifications you receive from a text-messaging app.

**Socket.IO** is a popular JS library used to take advantage of real-time communication. 
It comes with various convenient features like dealing with proxies and fallback to "polling" instead of web-sockets if something goes wrong. We'll be using this library to implement both our ends.

This project is inspired from the widely popular online game agar.io and is implemented purely using real time socket-based communication. You and your friends, anywhere in the world are on the same game-map and competing against each other to get the highest spot on the leader board, in real time! How cool is that?!


![mobile.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1617213275251/lgN-vuKEu.png)
**The UI is completely mobile friendly and accepts touch input!**


# **Tech Stack used:**
1. Node JS Back-end
2. Vanilla JavaScript Front-end
3. Socket.IO for real time communication
4. Auth0 for secure authentication
5. PostgreSQL
6. Express JS



##  **Rules of the game:**
1. Move your mouse/touch on the screen to move your character.
2. Absorb orbs by running over them in order to grow your character.
3. The larger you get the slower you are.
4. Objective: Absorb other players to get even larger but not lose speed.
5. The larger player absorbs the smaller player.

Check out the game hosted on Heroku get a better grasp!

From the rules themselves we can deduce that we need the following features in our app:
1. Physics based **collision detection** between orbs and the players.
2. **Cheating prevention** else players who know some JavaScript will simply teleport when they are going to be absorbed!
3. We must add some **AI driven bots** to the game else it will be too lonely if there is no one to play with!

How i made this project:

## **The frontend:**
### 1. The Canvas:
**The "tick":**
The moving game is based on a very simple approach. The server keeps track of the position of the orbs and the stats of the players (their name, size, color, speed, radius, score, etc) and sends this data to all the clients every 16 milliseconds. The client then renders this data on the canvas element on screen.
The client "draws" this image every 16 ms.

**The "tock":**
The client also calculates the "**vector**" of the player from mouse (or touch input in case of mobile) and sends this data to the server. The server then normalizes the vector so that no one cheats and updates the location of every player using the speed. Its like the old school dx = v.dt displacement-velocity relation you might have learned in high school! This is a socket.IO event called "tock" which sends the vector data as payload to the server.

So this **"tick-tock"** cycle has a period of 16ms hence the image on the screen moves at 60 frames per second!

### **2. Authentication:**
The client has the feature to either play as a guest or login via Auth0 which also supports google OAuth login. 
The authtication is based on JSON web tokens and is used to access protected GET and POST routes on the server. 
(check out public/auth.js to learn how it all works)

 All logged in players can view their stats saved in the database. 

# **The BackEnd**:
## **1. The classes:**
**Player Class:**
This class saves the socketID of the player, and an instance of the PlayerConfig and PlayerData class.

**PlayerConfig Class:**
This class has the private data of the player like the speed, vector, zoom, etc. which need not be sent to everyone.

**PlayerData class:**
This class has the public data of the player which is sent to everyone in the "tick" event every 16ms which is used by the client to render the game on screen. This split is primarily done to decrease the overhead on the server so that it requires less band-with speed to play.

Orb:
Contains the randomly-decided position of the orbs and the color.

## **2. socketMain.js**

This is where all the socket-based communication happens. the "tick" event is sent every 16 ms from here to every socket which contains as payload the players array, which is simply the array of all PlayerData objects. This is achieved via a simple setInterval.

This file also handles events like player death and disconnect in which case it removes the player's data from memory and saves the score data of the player into the postgres database.

The "tock" event is listened to in this file which updates the "vector" of the player sent to it by the client.

A playerInfo map is also maintained in this file which is nothing but a hashmap (Fast O(1) lookup times! ) that maps a player's socketID to its corresponding player object, used in expressMain to save the login info of the users and also in checkCollisions to check if player the dying player is a bot so we can add a new one (read botLogic section) . 


## **3. checkCollisions.js**

This is where the physics happens! every "tick" event, the server runs a simple brute force O(n^2) algorithm to find out if any collisions happened between the players or with the orbs. To make this a little bit faster the base check is the AABB collision detection test (read more here  [here](https://stackoverflow.com/questions/22512319/what-is-aabb-collision-detection). If this check passes the traditional Pythagoras Theorem is invoked to check if the objects really collide. If an orb collision happened, the player's score is increased and if a player collision happens the bigger player absorbs the smaller player (game over for smaller player :(, but he can always click play again!)

## **4. botLogic.js**
**
Bots and AI!** Well our approach is fairly simple, the bots are players whose movement (via vectors) is controlled by the server on the naive greedy logic: "Go to the Orb nearest to me". Bots have no fear of other players bigger than them but they are still quite efficient as they always follow the shortest possible path to the nearest orb.

Bots have random names generated from the API : http://names.drycodes.com/10

Bots are added only when the first player logs in and a new bot is added if a  bot dies to keep the flow of the game. All bots are removed if there is no human player currently playing the game to reduce the  overhead on the server when its idle.

## **5. expressMain.js**

Controls the AJAX requests. like "/leaderboard" which gives the leaderboard data and "/login" which logs the player into the app so it can access protected routes and view stats. Auth0 is used for authentication for enhanced security and also to make the work less tedious. No session data is saved since its JWT-based auth, so less overhead on server.
