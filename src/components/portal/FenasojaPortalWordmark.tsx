import { memo } from 'react';
import { FenasojaGoldenSoybean } from '@/components/brand/FenasojaGoldenSoybean';

const WORDMARK_LETTERS = [
  ['F', 'f'],
  ['E', 'e'],
  ['N', 'n'],
  ['A', 'a-first'],
  ['S', 's'],
] as const;

const WORDMARK_END_LETTERS = [
  ['J', 'j'],
  ['A', 'a-last'],
] as const;

function LetterGroup({ letters }: { letters: ReadonlyArray<readonly [string, string]> }) {
  return (
    <span className="portal-wordmark__letters">
      {letters.map(([letter, modifier]) => (
        <span key={modifier} className={`portal-wordmark__letter portal-wordmark__letter--${modifier}`}>
          {letter}
        </span>
      ))}
    </span>
  );
}

export const FenasojaPortalWordmark = memo(function FenasojaPortalWordmark() {
  return (
    <div className="portal-identity">
      <h1 id="portal-title" className="portal-identity__title">
        <span className="sr-only">FENASOJA 2028</span>
        <span className="portal-wordmark" aria-hidden="true">
          <span className="portal-wordmark__name">
            <LetterGroup letters={WORDMARK_LETTERS} />
            <FenasojaGoldenSoybean
              className="portal-soybean"
              grainClassName="portal-soybean__grain"
              auraClassName="portal-soybean__aura"
              dataTestId="portal-soybean"
            />
            <LetterGroup letters={WORDMARK_END_LETTERS} />
          </span>
          <span className="portal-wordmark__edition">
            <span className="portal-wordmark__edition-rule" />
            <span className="portal-wordmark__year">
              {[...'2028'].map((digit, index) => (
                <span
                  key={`${digit}-${index}`}
                  className={`portal-wordmark__digit portal-wordmark__digit--${index + 1}`}
                >
                  {digit}
                </span>
              ))}
            </span>
            <span className="portal-wordmark__edition-rule portal-wordmark__edition-rule--end" />
          </span>
        </span>
      </h1>
    </div>
  );
});
