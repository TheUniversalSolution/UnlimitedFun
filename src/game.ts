import Phaser from 'phaser';

const STORAGE_KEY = 'unlimitedfun-best';

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private obstacle!: Phaser.Physics.Arcade.Sprite;
  private ground!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private score = 0;
  private bestScore = 0;
  private isGameOver = false;
  private hasStarted = false;
  private speed = 240;
  private groundY = 0;
  private groundHeight = 0;

  constructor() {
    super('game');
  }

  create() {
    const { width, height } = this.scale;

    this.createTextures();

    this.groundHeight = 64;
    this.groundY = height - this.groundHeight / 2;

    this.ground = this.add.rectangle(width / 2, this.groundY, width, this.groundHeight, 0x13243a);
    this.physics.add.existing(this.ground, true);

    this.player = this.physics.add.sprite(96, this.groundY - this.groundHeight / 2, 'player');
    this.player.setOrigin(0.5, 1);
    this.player.setCollideWorldBounds(true);

    this.obstacle = this.physics.add.sprite(width + 120, this.groundY, 'obstacle');
    this.obstacle.setOrigin(0.5, 1);
    const obstacleBody = this.obstacle.body as Phaser.Physics.Arcade.Body;
    obstacleBody.setAllowGravity(false);
    this.obstacle.setImmovable(true);
    this.obstacle.setVelocityX(-this.speed);

    this.physics.add.collider(this.player, this.ground);
    this.physics.add.collider(this.player, this.obstacle, () => {
      this.endRun();
    });

    this.bestScore = this.loadBestScore();

    const hudStyle = {
      fontFamily: '"Space Grotesk", sans-serif',
      fontSize: '20px',
      color: '#f5f7ff'
    };

    this.scoreText = this.add.text(16, 16, 'Score 0', hudStyle).setScrollFactor(0);
    this.bestText = this.add.text(16, 40, `Best ${this.bestScore}`, hudStyle).setScrollFactor(0);

    this.messageText = this.add
      .text(width / 2, height / 2 - 40, 'Tap to jump', {
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: '28px',
        color: '#f5f7ff',
        align: 'center'
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.input.on('pointerdown', () => {
      if (this.isGameOver) {
        this.resetRun();
        return;
      }

      const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
      if (playerBody.blocked.down) {
        this.player.setVelocityY(-540);
        if (!this.hasStarted) {
          this.hasStarted = true;
          this.messageText.setVisible(false);
        }
      }
    });
  }

  update(_time: number, delta: number) {
    if (this.isGameOver) {
      return;
    }

    this.score += delta * 0.05;
    const scoreValue = Math.floor(this.score);
    this.scoreText.setText(`Score ${scoreValue}`);

    if (this.obstacle.x < -this.obstacle.width) {
      this.resetObstacle();
    }
  }

  private createTextures() {
    const gfx = this.add.graphics();

    gfx.fillStyle(0xfcd34d, 1);
    gfx.fillRoundedRect(0, 0, 46, 46, 12);
    gfx.generateTexture('player', 46, 46);

    gfx.clear();
    gfx.fillStyle(0xff6b35, 1);
    gfx.fillRect(0, 0, 32, 60);
    gfx.generateTexture('obstacle', 32, 60);

    gfx.destroy();
  }

  private resetObstacle() {
    const { width } = this.scale;
    const gap = Phaser.Math.Between(140, 260);
    this.obstacle.x = width + gap;
    this.obstacle.setVelocityX(-this.speed);
  }

  private endRun() {
    if (this.isGameOver) {
      return;
    }

    this.isGameOver = true;
    this.physics.pause();
    this.player.setTint(0xff5a5a);

    const finalScore = Math.floor(this.score);
    if (finalScore > this.bestScore) {
      this.bestScore = finalScore;
      this.saveBestScore(this.bestScore);
      this.bestText.setText(`Best ${this.bestScore}`);
    }

    this.messageText.setText('Ouch!\nTap to restart');
    this.messageText.setVisible(true);
  }

  private resetRun() {
    this.isGameOver = false;
    this.hasStarted = false;
    this.score = 0;
    this.scoreText.setText('Score 0');
    this.player.clearTint();
    this.physics.resume();

    this.player.setPosition(96, this.groundY - this.groundHeight / 2);
    this.player.setVelocity(0, 0);

    this.obstacle.setPosition(this.scale.width + 120, this.groundY);
    this.obstacle.setVelocityX(-this.speed);

    this.messageText.setText('Tap to jump');
    this.messageText.setVisible(true);
  }

  private loadBestScore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const value = raw ? Number(raw) : 0;
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }

  private saveBestScore(value: number) {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }
}