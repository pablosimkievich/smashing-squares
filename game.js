class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.score = 0;
        this.highScore = localStorage.getItem('highScore') || 0;
        this.lastClickTime = Date.now();
        this.squares = [];
        this.raindrops = [];
        this.particles = [];
        this.timeWithoutClick = 0;
        this.gameSpeed = 1;
        this.colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];
        this.gameStartTime = Date.now();
        this.gameTime = 60; // 60 seconds
        this.isGameOver = false;
        this.initialSpawnRate = 1000; // Initial spawn rate for squares (1 second)
        this.minSpawnRate = 300; // Minimum spawn rate (faster spawning)
        this.rainIntensity = 5; // Initial number of raindrops
        this.maxRainIntensity = 30; // Maximum raindrops per spawn
        this.rainSpeedMultiplier = 1; // Base rain speed
        this.maxRainSpeedMultiplier = 3; // Maximum rain speed multiplier
        this.baseRainIntensity = 5; // Base number of raindrops
        
        // Add drag-related properties
        this.draggedSquare = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.mouseX = 0;
        this.mouseY = 0;
        
        // Add last double click time tracking
        this.lastDoubleClickTime = 0;
        this.doubleClickDelay = 300; // milliseconds
        
        // Show welcome message before starting
        this.showWelcomePopup();

        // Add explosion sound with format fallback
        this.explosionSound = this.loadAudioWithFallback([
            'assets/explosion.mp3',
            'assets/explosion.ogg',
            'assets/explosion.wav'
        ]);
        this.explosionSound.volume = 0.15; 
    }

    loadAudioWithFallback(sources) {
        const audio = new Audio();
        for (const source of sources) {
            try {
                audio.src = source;
                // If can play, use this source
                if (audio.canPlayType(this.getAudioMimeType(source)) !== "") {
                    return audio;
                }
            } catch (e) {
                console.warn(`Failed to load audio source: ${source}`);
            }
        }
        return audio; // Return last attempt even if none worked
    }

    getAudioMimeType(source) {
        const ext = source.split('.').pop().toLowerCase();
        const mimeTypes = {
            'mp3': 'audio/mpeg',
            'ogg': 'audio/ogg',
            'wav': 'audio/wav'
        };
        return mimeTypes[ext] || '';
    }

    showWelcomePopup() {
        const popup = document.createElement('div');
        popup.id = 'gameOverPopup'; // Using same styles as game over popup
        popup.innerHTML = `
            <div class="popup-content">
                <h2>SAMASHING SQUARES</h2>
                <div class="rules">
                    <p>DESTROY SQUARES TO SCORE!</p>
                    <p>→ DOUBLE CLICK: Explode squares</p>
                    <p>→ DRAG & SMASH: Grab squares and crash them!</p>
                    <p>You have 60 seconds...</p>
                </div>
                <button id="startButton">START GAME</button>
            </div>
        `;

        document.body.appendChild(popup);

        // Start game when button is clicked
        document.getElementById('startButton').addEventListener('click', () => {
            popup.remove();
            this.gameStartTime = Date.now(); // Reset game start time
            this.init();
        });
    }

    init() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Add double click event
        this.canvas.addEventListener('click', this.handleDoubleClick.bind(this));
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        this.updateScore();
        this.gameLoop();
        
        // Modified spawn intervals
        this.spawnSquareInterval = setInterval(() => this.spawnSquare(), this.initialSpawnRate);
        this.rainInterval = setInterval(() => {
            for (let i = 0; i < this.rainIntensity; i++) {
                this.spawnRaindrop();
            }
        }, 100); // Spawn rain every 100ms
        this.difficultyInterval = setInterval(() => this.increaseDifficulty(), 5000); // Increase difficulty every 5 seconds
    }

    handleDoubleClick(event) {
        const currentTime = Date.now();
        if (currentTime - this.lastDoubleClickTime <= this.doubleClickDelay) {
            const rect = this.canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            for (let i = this.squares.length - 1; i >= 0; i--) {
                const square = this.squares[i];
                if (x >= square.x && x <= square.x + square.size &&
                    y >= square.y && y <= square.y + square.size) {
                    
                    // Handle double click explosion
                    this.score += square.points;
                    this.createExplosion(square.x + square.size/2, square.y + square.size/2, square.color);
                    this.squares.splice(i, 1);
                    this.updateScore();
                    this.updateRainIntensity();
                    return;
                }
            }
        }
        this.lastDoubleClickTime = currentTime;
    }

    handleMouseDown(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Only try to start dragging
        for (let i = this.squares.length - 1; i >= 0; i--) {
            const square = this.squares[i];
            if (x >= square.x && x <= square.x + square.size &&
                y >= square.y && y <= square.y + square.size) {
                this.isDragging = true;
                this.draggedSquare = square;
                this.dragOffset.x = x - square.x;
                this.dragOffset.y = y - square.y;
                square.originalDx = square.dx;
                square.originalDy = square.dy;
                square.dx = 0;
                square.dy = 0;
                return;
            }
        }
    }

    handleMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = event.clientX - rect.left;
        this.mouseY = event.clientY - rect.top;

        if (this.isDragging && this.draggedSquare) {
            this.draggedSquare.x = this.mouseX - this.dragOffset.x;
            this.draggedSquare.y = this.mouseY - this.dragOffset.y;
            
            // Check for collisions with other squares
            this.checkCollisions(this.draggedSquare);
        }
    }

    handleMouseUp() {
        if (this.draggedSquare) {
            // Reduced speed multiplier from 2.5 to 1.8
            const speedMultiplier = 1.8;
            this.draggedSquare.dx = this.draggedSquare.originalDx * speedMultiplier;
            this.draggedSquare.dy = this.draggedSquare.originalDy * speedMultiplier;
        }
        this.isDragging = false;
        this.draggedSquare = null;
    }

    checkCollisions(square) {
        for (let i = this.squares.length - 1; i >= 0; i--) {
            const otherSquare = this.squares[i];
            if (otherSquare === square) continue;

            if (this.isColliding(square, otherSquare)) {
                const relativeSpeed = Math.sqrt(
                    Math.pow(square.dx - otherSquare.dx, 2) + 
                    Math.pow(square.dy - otherSquare.dy, 2)
                );

                // Very low threshold for drag-and-drop, high for natural collisions
                const speedThreshold = this.isDragging ? 
                    0.5 * this.gameSpeed :  // Very low threshold when dragging - almost any collision will work
                    12 * this.gameSpeed;    // High threshold for natural collisions

                if (relativeSpeed > speedThreshold) {
                    // Much higher points for drag-and-drop strategy
                    if (this.isDragging) {
                        const combinedPoints = (square.points + otherSquare.points) * 5; // 5x points for drag-smash
                        this.score += combinedPoints;
                    } else {
                        // Regular points for natural collisions
                        this.score += square.points + otherSquare.points;
                    }

                    this.createExplosion(square.x + square.size/2, square.y + square.size/2, square.color);
                    this.createExplosion(otherSquare.x + otherSquare.size/2, otherSquare.y + otherSquare.size/2, otherSquare.color);

                    this.squares = this.squares.filter(s => s !== square && s !== otherSquare);
                    
                    this.isDragging = false;
                    this.draggedSquare = null;

                    this.updateScore();
                    this.updateRainIntensity();
                } else {
                    this.handleBounceCollision(square, otherSquare);
                }
                return;
            }
        }
    }

    handleBounceCollision(square1, square2) {
        // Calculate collision normal
        const dx = square2.x - square1.x;
        const dy = square2.y - square1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Normalize the collision vector
        const nx = dx / distance;
        const ny = dy / distance;

        // Calculate relative velocity
        const vx = square1.dx - square2.dx;
        const vy = square1.dy - square2.dy;
        
        // Calculate relative velocity in terms of normal direction
        const velocityAlongNormal = vx * nx + vy * ny;

        // Don't resolve if objects are moving apart
        if (velocityAlongNormal > 0) return;

        // Bounce coefficient (1 = perfect elastic collision)
        const restitution = 1.2; // Slightly more than 1 to add some energy

        // Calculate impulse scalar
        const impulse = -(1 + restitution) * velocityAlongNormal;

        // Apply impulse
        square1.dx = square1.dx - impulse * nx;
        square1.dy = square1.dy - impulse * ny;
        square2.dx = square2.dx + impulse * nx;
        square2.dy = square2.dy + impulse * ny;

        // Prevent squares from sticking together by moving them apart
        const overlap = (square1.size + square2.size) / 2 - distance;
        if (overlap > 0) {
            square1.x -= overlap * nx / 2;
            square1.y -= overlap * ny / 2;
            square2.x += overlap * nx / 2;
            square2.y += overlap * ny / 2;
        }
    }

    isColliding(square1, square2) {
        return !(square1.x + square1.size < square2.x || 
                square1.x > square2.x + square2.size || 
                square1.y + square1.size < square2.y || 
                square1.y > square2.y + square2.size);
    }

    createExplosion(x, y, color) {
        // Play explosion sound with random pitch
        const explosionSoundClone = this.explosionSound.cloneNode();
        // Random pitch between 0.8 and 1.2 (20% variation)
        explosionSoundClone.volume = 0.15; // Set volume for the clone (15%)
        explosionSoundClone.playbackRate = 0.8 + Math.random() * 0.4;
        explosionSoundClone.play();

        const particleCount = 30;
        for (let i = 0; i < particleCount; i++) {
            const particle = {
                x: x,
                y: y,
                dx: (Math.random() - 0.5) * 15,
                dy: (Math.random() - 0.5) * 15,
                size: Math.random() * 6 + 3,
                color: color,
                life: 1
            };
            this.particles.push(particle);
        }
    }

    spawnSquare() {
        const size = Math.random() * 30 + 20; // 20-50px
        const dx = (Math.random() - 0.5) * 2 * this.gameSpeed;
        const dy = (Math.random() - 0.5) * 2 * this.gameSpeed;
        
        // Increased base points calculation
        const basePoints = Math.ceil((50 - size) * 20); // Multiplied by 20 instead of 10
        
        const square = {
            x: Math.random() * (this.canvas.width - size),
            y: Math.random() * (this.canvas.height - size),
            dx: dx,
            dy: dy,
            size: size,
            color: this.colors[Math.floor(Math.random() * this.colors.length)],
            points: basePoints
        };
        
        this.squares.push(square);
    }

    spawnRaindrop() {
        const raindrop = {
            x: Math.random() * this.canvas.width,
            y: -5,
            // Speed now affected by rainSpeedMultiplier
            speed: (Math.random() * 5 + 5) * this.rainSpeedMultiplier,
            width: Math.random() * 2 + 1,
            height: Math.random() * 7 + 5
        };
        this.raindrops.push(raindrop);
    }

    increaseDifficulty() {
        // Reduced difficulty increase from 0.1 to 0.05 for smoother progression
        this.gameSpeed += 0.05;

        // Calculate how many squares to spawn based on game progress
        const gameProgress = (Date.now() - this.gameStartTime) / 1000; // seconds elapsed
        const extraSquares = Math.floor(gameProgress / 10); // Add more squares every 10 seconds
        const squaresToSpawn = Math.min(2 + extraSquares, 8); // Cap at 8 squares per spawn

        // Spawn increasing number of squares
        for (let i = 0; i < squaresToSpawn; i++) {
            this.spawnSquare();
        }

        // Update rain based on new square count
        this.updateRainIntensity();

        // Increase spawn rate by reducing interval
        clearInterval(this.spawnSquareInterval);
        const newSpawnRate = Math.max(this.minSpawnRate, this.initialSpawnRate - (this.gameSpeed * 100));
        this.spawnSquareInterval = setInterval(() => this.spawnSquare(), newSpawnRate);
    }

    updateRainIntensity() {
        // Calculate rain intensity based on number of squares
        const squareCount = this.squares.length;
        
        // Increase rain intensity - 1 raindrop per 2 squares
        this.rainIntensity = Math.min(
            this.maxRainIntensity, 
            this.baseRainIntensity + Math.floor(squareCount / 2)
        );

        // Increase rain speed based on square count
        this.rainSpeedMultiplier = Math.min(
            this.maxRainSpeedMultiplier,
            1 + (squareCount * 0.1) // Increase by 10% per square
        );
    }

    updateScore() {
        document.getElementById('current-score').textContent = `YOUR SCORE: ${this.score}`;
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('highScore', this.highScore);
        }
        document.getElementById('high-score').textContent = `YOUR HIGHEST: ${this.highScore}`;
    }

    showGameOverPopup() {
        // Remove any existing popup
        const existingPopup = document.getElementById('gameOverPopup');
        if (existingPopup) {
            existingPopup.remove();
        }

        const popup = document.createElement('div');
        popup.id = 'gameOverPopup';
        popup.innerHTML = `
            <div class="popup-content">
                <h2>GAME OVER</h2>
                <p>FINAL SCORE: ${this.score}</p>
                <p>YOUR BEST SCORE: ${this.highScore}</p>
                <button id="restartButton">PLAY AGAIN</button>
            </div>
        `;

        document.body.appendChild(popup);

        // Add event listener to restart button
        document.getElementById('restartButton').addEventListener('click', () => {
            popup.remove();
            this.resetGame();
        });
    }

    resetGame() {
        // Add these to existing reset
        clearInterval(this.spawnSquareInterval);
        clearInterval(this.rainInterval);
        clearInterval(this.difficultyInterval);
        
        this.score = 0;
        this.squares = [];
        this.raindrops = [];
        this.particles = [];
        this.gameSpeed = 1;
        this.rainIntensity = this.baseRainIntensity;
        this.rainSpeedMultiplier = 1;
        this.gameStartTime = Date.now();
        this.isGameOver = false;
        this.lastClickTime = Date.now();
        this.updateScore();
        
        // Reinitialize intervals
        this.init();
    }

    gameLoop() {
        if (this.isGameOver) return;

        const currentTime = Date.now();
        const elapsedTime = (currentTime - this.gameStartTime) / 1000;
        const remainingTime = Math.max(0, this.gameTime - elapsedTime);

        document.getElementById('timer').textContent = `TIME LEFT: ${Math.ceil(remainingTime)}`;

        if (remainingTime <= 0 && !this.isGameOver) {
            this.isGameOver = true;
            this.showGameOverPopup();
            return;
        }

        this.updateRainIntensity();

        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Update and draw raindrops
        for (let i = this.raindrops.length - 1; i >= 0; i--) {
            const raindrop = this.raindrops[i];
            // Speed now affected by both gameSpeed and rainSpeedMultiplier
            raindrop.y += raindrop.speed * this.gameSpeed;
            
            // Draw raindrop with gradient
            const gradient = this.ctx.createLinearGradient(
                raindrop.x, raindrop.y, 
                raindrop.x, raindrop.y + raindrop.height
            );
            gradient.addColorStop(0, '#0066FF');
            gradient.addColorStop(1, '#003399');
            
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(
                raindrop.x, 
                raindrop.y, 
                raindrop.width, 
                raindrop.height
            );

            if (raindrop.y > this.canvas.height) {
                this.raindrops.splice(i, 1);
            }
        }

        // Update and draw particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.x += particle.dx;
            particle.y += particle.dy;
            particle.life -= 0.02;
            
            this.ctx.globalAlpha = particle.life;
            this.ctx.fillStyle = particle.color;
            this.ctx.beginPath();
            this.ctx.roundRect(particle.x, particle.y, particle.size, particle.size, particle.size * 0.5);
            this.ctx.fill();
            
            if (particle.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
        this.ctx.globalAlpha = 1;

        // Update and draw squares
        for (let i = this.squares.length - 1; i >= 0; i--) {
            const square = this.squares[i];
            
            square.x += square.dx * this.gameSpeed;
            square.y += square.dy * this.gameSpeed;
            
            if (square.x <= 0 || square.x + square.size >= this.canvas.width) {
                square.dx *= -1;
            }
            if (square.y <= 0 || square.y + square.size >= this.canvas.height) {
                square.dy *= -1;
            }

            this.ctx.fillStyle = square.color;
            this.ctx.beginPath();
            const radius = square.size * 0.2;
            this.ctx.roundRect(square.x, square.y, square.size, square.size, radius);
            this.ctx.fill();
        }

        // Check for natural collisions between squares
        for (let i = 0; i < this.squares.length; i++) {
            for (let j = i + 1; j < this.squares.length; j++) {
                const square1 = this.squares[i];
                const square2 = this.squares[j];
                
                if (this.isColliding(square1, square2)) {
                    // Calculate relative velocity
                    const relativeSpeed = Math.sqrt(
                        Math.pow(square1.dx - square2.dx, 2) + 
                        Math.pow(square1.dy - square2.dy, 2)
                    );

                    const speedThreshold = 5 * this.gameSpeed; // Lowered from 8 to 5

                    if (relativeSpeed > speedThreshold) {
                        // High speed collision - Explode
                        this.createExplosion(square1.x + square1.size/2, square1.y + square1.size/2, square1.color);
                        this.createExplosion(square2.x + square2.size/2, square2.y + square2.size/2, square2.color);
                        
                        this.squares.splice(j, 1);
                        this.squares.splice(i, 1);
                        
                        this.updateRainIntensity();
                        break;
                    } else {
                        // Low speed collision - Bounce
                        this.handleBounceCollision(square1, square2);
                    }
                }
            }
        }

        // Draw dragging line
        if (this.isDragging && this.draggedSquare) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = this.draggedSquare.color;
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.moveTo(this.draggedSquare.x + this.draggedSquare.size/2, 
                           this.draggedSquare.y + this.draggedSquare.size/2);
            this.ctx.lineTo(this.mouseX, this.mouseY);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        requestAnimationFrame(() => this.gameLoop());
    }
}

window.onload = () => {
    new Game();
};
