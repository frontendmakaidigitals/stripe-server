"use client";

type SpinnerProps = {
  size?: number;
  color?: string;
  speed?: number;
  stroke?: number;
};

export function Spinner({
  size = 40,
  color = "black",
  speed = 1,
  stroke = 3,
}: SpinnerProps) {
  const lines = 12;

  return (
    <>
      <style>{`
        @keyframes spinner-pulse {
          0%, 80%, 100% {
            transform: scaleY(0.75);
            opacity: 0;
          }
          20% {
            transform: scaleY(1);
            opacity: 1;
          }
        }
      `}</style>

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          height: size,
          width: size,
        }}
      >
        {Array.from({ length: lines }).map((_, i) => {
          const index = i + 1;
          const rotation = (360 / -lines) * index;
          const delay = (speed / -lines) * index;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                top: 0,
                left: `calc(50% - ${stroke / 2}px)`,
                display: "flex",
                alignItems: "flex-start",
                height: "100%",
                width: stroke,
                transform: `rotate(${rotation}deg)`,
              }}
            >
              <div
                style={{
                  height: "30%",
                  width: "100%",
                  borderRadius: stroke / 2,
                  backgroundColor: color,
                  animation: `spinner-pulse ${speed}s ease-in-out infinite`,
                  animationDelay: `${delay}s`,
                  transformOrigin: "center bottom",
                  transition: "background-color 0.3s ease",
                }}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
