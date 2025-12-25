import './style.css';
import { RunnerGame } from './game';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App container not found');
}

const game = new RunnerGame(app);
game.start();
