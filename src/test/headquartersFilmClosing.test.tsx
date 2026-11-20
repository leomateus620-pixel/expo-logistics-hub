import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeadquartersFilm } from '@/features/commercial-map/components/HeadquartersFilm';
import { FENASOJA_2028_OPENING_TIMESTAMP, formatFenasojaCountdownLabel, getFenasojaCountdown } from '@/lib/fenasoja-countdown';

function openFilm() {
  render(<HeadquartersFilm />);
  fireEvent.click(screen.getByRole('button', { name: 'Assistir ao filme FenaSoja 2028' }));
  const video = screen.getByLabelText('Filme FenaSoja 2028, amanhecer no parque') as HTMLVideoElement;
  Object.defineProperty(video, 'duration', { value: 32 });
  return video;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('encerramento do filme no mapa', () => {
  it('sincroniza a exibição com o vídeo e conta o tempo real durante a pausa e após o último quadro', () => {
    vi.setSystemTime(FENASOJA_2028_OPENING_TIMESTAMP - 123_000);
    const video = openFilm();
    fireEvent.loadedMetadata(video);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    video.currentTime = 26;
    fireEvent.seeked(video);
    expect(screen.getByRole('timer')).toHaveAccessibleName(formatFenasojaCountdownLabel(getFenasojaCountdown()));
    fireEvent.pause(video);
    act(() => { vi.advanceTimersByTime(1100); });
    expect(screen.getByRole('timer')).toHaveAccessibleName(formatFenasojaCountdownLabel(getFenasojaCountdown()));
    video.currentTime = 32;
    fireEvent.ended(video);
    act(() => { vi.advanceTimersByTime(1100); });
    expect(screen.getByRole('timer')).toHaveAccessibleName(formatFenasojaCountdownLabel(getFenasojaCountdown()));
    video.currentTime = 0;
    fireEvent.play(video);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    video.currentTime = 29;
    fireEvent.timeUpdate(video);
    expect(screen.getByRole('timer')).toBeVisible();
    video.currentTime = 5;
    fireEvent.seeking(video);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('mostra a abertura oficial sem valores negativos e preserva a composição ao ampliar sem a API fullscreen', () => {
    vi.setSystemTime(FENASOJA_2028_OPENING_TIMESTAMP + 1000);
    const video = openFilm();
    video.currentTime = 30;
    fireEvent.timeUpdate(video);
    expect(screen.getByRole('status')).toHaveTextContent('A Fenasoja 2028 está oficialmente aberta.');
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver filme em tela cheia' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('data-viewport-expanded', 'true');
    expect(screen.getByRole('status')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Sair da tela cheia do filme' }));
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-viewport-expanded');
    expect(video).toBeInTheDocument();
  });
});
