import './styles/game.css';
import { initPWA } from './pwa';
import { loadTelegramSdk } from './platform/telegram';
import { start } from './game';

initPWA();
loadTelegramSdk().finally(() => { start(); });
