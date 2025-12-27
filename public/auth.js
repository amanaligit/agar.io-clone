// Custom authentication module
const Auth = {
    token: null,
    user: null,

    init() {
        // Load token from localStorage if exists
        const savedToken = localStorage.getItem('auth_token');
        const savedUser = localStorage.getItem('auth_user');
        
        if (savedToken && savedUser) {
            this.token = savedToken;
            this.user = JSON.parse(savedUser);
        }
    },

    isAuthenticated() {
        return !!this.token;
    },

    getToken() {
        return this.token;
    },

    getUser() {
        return this.user;
    },

    async register(username, password) {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Registration failed');
        }

        this.token = data.token;
        this.user = data.user;
        localStorage.setItem('auth_token', this.token);
        localStorage.setItem('auth_user', JSON.stringify(this.user));

        return data;
    },

    async login(username, password) {
        const response = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        this.token = data.token;
        this.user = data.user;
        localStorage.setItem('auth_token', this.token);
        localStorage.setItem('auth_user', JSON.stringify(this.user));

        return data;
    },

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        window.location.reload();
    },

    // Associate socket with authenticated user
    async associateSocket(socketId, name) {
        if (!this.token) return;

        await fetch('/login', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ socketId, name })
        });
    }
};

// Initialize auth on load
Auth.init();

window.onload = async () => {
    updateUI();
};

const logout = () => {
    Auth.logout();
};

const updateUI = async () => {
    if (Auth.isAuthenticated()) {
        $('#loginModal').modal('hide');
        $("#spawnModal").modal('show');
        document.querySelector('#logout-btn').style.display = "block";
        document.querySelector('#show-stats').style.display = "block";

        player.name = Auth.getUser().username;
        document.querySelector(".player-name").innerHTML = player.name;

        // Associate socket with user (wait for socket to be ready)
        setTimeout(() => {
            if (socket && socket.id) {
                Auth.associateSocket(socket.id, player.name);
            }
        }, 500);
    } else {
        $('#loginModal').modal('show');
        document.querySelector('#logout-btn').style.display = "none";
        document.querySelector('#show-stats').style.display = "none";
    }
};

const showLoginForm = () => {
    document.getElementById('auth-forms-container').classList.remove('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
};

const showRegisterForm = () => {
    document.getElementById('auth-forms-container').classList.remove('hidden');
    document.getElementById('register-form').classList.remove('hidden');
    document.getElementById('login-form').classList.add('hidden');
};

const handleLogin = async (event) => {
    event.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    try {
        errorEl.textContent = '';
        await Auth.login(username, password);
        updateUI();
    } catch (err) {
        errorEl.textContent = err.message;
    }
};

const handleRegister = async (event) => {
    event.preventDefault();
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    const errorEl = document.getElementById('register-error');

    if (password !== confirmPassword) {
        errorEl.textContent = 'Passwords do not match';
        return;
    }

    try {
        errorEl.textContent = '';
        await Auth.register(username, password);
        updateUI();
    } catch (err) {
        errorEl.textContent = err.message;
    }
};
