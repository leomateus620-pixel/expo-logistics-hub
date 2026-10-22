import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

/** Authored USD banknote metaphor requested by the owner; operational money remains BRL. */
export function ScenarioEmblem({ active = true }: { active?: boolean }) {
  const emblemId = useId().replace(/:/g, "");
  const ref = useRef<HTMLSpanElement>(null),
    [visible, setVisible] = useState(true),
    [foreground, setForeground] = useState(true);
  useEffect(() => {
    const visibility = () =>
      setForeground(document.visibilityState !== "hidden");
    visibility();
    document.addEventListener("visibilitychange", visibility);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) =>
            setVisible(entry.isIntersecting),
          );
    if (ref.current) observer?.observe(ref.current);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      observer?.disconnect();
    };
  }, []);
  return (
    <span
      ref={ref}
      className="fsc-emblem-live"
      data-running={active && visible && foreground}
      role="img"
      aria-label="Notas ilustrativas: pessimista US$ 10, realista US$ 20 e otimista US$ 100. Indicadores financeiros em reais."
    >
      <svg
        viewBox="0 0 126 74"
        fill="none"
        focusable="false"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id={`${emblemId}-paper`}
            width="2.4"
            height="2.4"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 1.2h2.4M1.2 0v2.4"
              stroke="#25463c"
              strokeWidth=".15"
              opacity=".2"
            />
          </pattern>
        </defs>
        <g className="fse-treasury-seal">
          <circle cx="62" cy="35" r="29" />
          <circle cx="62" cy="35" r="25" />
          {Array.from({ length: 24 }, (_, i) => (
            <path key={i} d="M62 6v3" transform={`rotate(${i * 15} 62 35)`} />
          ))}
          <path d="M48 44c15-14 19-24 28-30M53 39c-9-1-11-6-10-10 8-1 13 3 14 7M60 30c-2-8 2-14 8-14 2 7-1 12-5 15" />
        </g>
        <path className="fse-note-ground" d="M8 65h106M18 69h84" />
        {[
          { value: "10", x: 4, y: 32, rotate: -12, tone: "gold" },
          { value: "20", x: 40, y: 23, rotate: 0, tone: "blue" },
          { value: "100", x: 74, y: 14, rotate: 12, tone: "green" },
        ].map((note, index) => (
          <g
            key={note.value}
            transform={`translate(${note.x} ${note.y}) rotate(${note.rotate} 23 14)`}
          >
            <g
              className="fse-note-entry"
              style={
                { "--note-entry-delay": `${index * 320}ms` } as CSSProperties
              }
            >
              <g
                className={`fse-note fse-note--${note.tone}`}
                style={
                  { "--note-float-delay": `${index * -1.4}s` } as CSSProperties
                }
              >
                <rect
                  className="fse-note-shadow"
                  x="1"
                  y="3"
                  width="46"
                  height="28"
                  rx="3"
                />
                <rect
                  className="fse-note-paper"
                  width="46"
                  height="28"
                  rx="1.7"
                />
                <rect
                  x="1"
                  y="1"
                  width="44"
                  height="26"
                  rx="1.2"
                  fill={`url(#${emblemId}-paper)`}
                />
                <path
                  className="fse-note-frame"
                  d="M7 2h32l5 5v14l-5 5H7l-5-5V7ZM8 3.5h30l4.5 4.5v12l-4.5 4.5H8L3.5 20V8Z"
                />
                <path
                  className="fse-note-engraving"
                  d="M5 8h5M5 10h4M5 12h4M5 14h4M5 16h4M5 18h4M5 20h5M27 7h12M27 9h13M27 21h13M26 23h13"
                />
                {note.value === "100" && (
                  <path className="fse-security-ribbon" d="M25 2v24" />
                )}
                <ellipse
                  className="fse-portrait-oval"
                  cx="16"
                  cy="14"
                  rx="7.8"
                  ry="10.2"
                />
                <ellipse
                  className="fse-note-frame"
                  cx="16"
                  cy="14"
                  rx="6.8"
                  ry="9.3"
                />
                <g className="fse-portrait">
                  <path d="M10 23c1-3 3-4 5-4l1 2 2-2c3 0 4 2 5 4M14 18v2m4-2v2M13 10c0-3 6-3 6 0l-.4 5c-.6 4-4.4 4-5 0Z" />
                  <path
                    d={
                      note.value === "10"
                        ? "M12 12c-2-3 0-6 3-6 4-1 6 2 5 6M12 8l4-3 4 3"
                        : note.value === "20"
                          ? "M12 14c-4-2-1-5-1-6 0-3 4-4 7-2 4 0 4 4 2 6M11 9l3-3 4 1 3 3"
                          : "M12 15c-3-1-2-6 0-6M20 15c3-1 2-6 0-6M14 8c1-1 3-1 4 0"
                    }
                  />
                  <path d="M14 12h1m2 0h1M16 12v3h1m-2 2h2M12 22l3-2m4 2-2-2M13 23v-2m7 2v-2" />
                </g>
                <text
                  className="fse-note-heading"
                  x="28"
                  y="5.7"
                  textAnchor="middle"
                >
                  UNITED STATES
                </text>
                <circle className="fse-note-seal" cx="34" cy="15.5" r="7" />
                <text
                  className="fse-note-value"
                  x="33.5"
                  y="18.8"
                  textAnchor="middle"
                >
                  {note.value}
                </text>
                <text
                  className="fse-note-currency"
                  x="33.5"
                  y="23"
                  textAnchor="middle"
                >
                  DOLLARS
                </text>
                <text className="fse-note-corner" x="4.5" y="6">
                  {note.value}
                </text>
                <text
                  className="fse-note-corner"
                  x="42"
                  y="25"
                  textAnchor="end"
                >
                  {note.value}
                </text>
                <text
                  className="fse-note-serial"
                  x="13"
                  y="26"
                  textAnchor="middle"
                >
                  F 2028 A
                </text>
              </g>
            </g>
          </g>
        ))}
      </svg>
    </span>
  );
}
