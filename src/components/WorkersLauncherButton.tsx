import './workers-launcher.css';
export function WorkersLauncherButton({ open, docked, onOpen }: { open: boolean; docked: boolean; onOpen: () => void }) {
  return <button type="button" data-workers-launcher aria-label="Abrir BOT FENASOJA" title="Bot FENASOJA"
    aria-keyshortcuts="Control+k Meta+k" aria-haspopup="dialog" aria-expanded={open} onClick={onOpen}
    className={`workers-launcher-button ${docked ? 'workers-launcher-button--docked' : 'workers-launcher-button--floating'}`}>
    <span className="workers-launcher-button__mascot" aria-hidden="true">
      <img src="/bot-fenasoja/mascot-open.webp" alt="" width={30} height={30} draggable={false} />
      <img className="workers-launcher-button__blink" src="/bot-fenasoja/mascot-blink.webp" alt="" width={30} height={30} draggable={false} />
    </span>
    <span className="workers-launcher-button__label">Bot FENASOJA</span>
  </button>;
}
