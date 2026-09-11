const CAR_COLORS = ['#e64045', '#1687be', '#f0b930', '#7149b4', '#e76f31', '#15916c'];
export function BumperCarBody({ index }: { index: number }) {
  return (
    <>
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.2, 0.38]} />
        <meshStandardMaterial
          color={CAR_COLORS[index % CAR_COLORS.length]}
          metalness={0.28}
          roughness={0.38}
        />
      </mesh>
      <mesh position={[0, 0.15, -0.02]}>
        <boxGeometry args={[0.28, 0.16, 0.23]} />
        <meshStandardMaterial color="#22292c" metalness={0.18} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.09, 0.025, 6, 12]} />
        <meshStandardMaterial color="#f2d34f" roughness={0.42} />
      </mesh>
    </>
  );
}

export function bumperCarSpawn(index: number): [number, number, number] {
  const column = index % 3;
  const row = Math.floor(index / 3);
  return [-0.72 + column * 0.72, 0.34, -0.43 + row * 0.56];
}

