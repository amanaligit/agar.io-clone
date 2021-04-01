let auth0 = null;


const configureClient = async () => {
    auth0 = await createAuth0Client({
        domain: 'dev-earqz191.us.auth0.com',
        client_id: 'DfDeOpjtFHdOpeQF54fqeZpM9aGwG1ap',
        audience: "https://agario-clone-aman.herokuapp.com/"
    });
};

window.onload = async () => {
    await configureClient();
    updateUI();

    const isAuthenticated = await auth0.isAuthenticated();

    if (isAuthenticated) {
        // show the gated content
        updateUI();
        return;
    }
    else {

        $('#loginModal').modal('show');
    }

    // NEW - check for the code and state parameters
    const query = window.location.search;
    if (query.includes("code=") && query.includes("state=")) {

        // Process the login state
        await auth0.handleRedirectCallback();

        updateUI();
        // Use replaceState to redirect the user away and remove the querystring parameters
        window.history.replaceState({}, document.title, "/");
    }
};



const logout = () => {
    auth0.logout({
        returnTo: window.location.origin
    });
};

const updateUI = async () => {
    const isAuthenticated = await auth0.isAuthenticated();

    // NEW - add logic to show/hide gated content after authentication
    if (isAuthenticated) {

        $('#loginModal').modal('hide');
        $("#spawnModal").modal('show');
        document.querySelector('#logout-btn').style.display = "block";
        document.querySelector('#show-stats').style.display = "block";
        const user = await auth0.getUser();

        player.name = user.name;
        document.querySelector(".player-name").innerHTML = player.name;
        $('#loginModal').modal('hide');
        $("#spawnModal").modal('show');
        const token = await auth0.getTokenSilently();
        const response = await fetch("/login", {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ socketId: socket.id, name: user.name })
        });
        // Make the call to the API, setting the token
        // in the Authorization header

    } else {
        //...
    }
};
const login = async () => {
    await auth0.loginWithRedirect({
        redirect_uri: window.location.origin
    });
};