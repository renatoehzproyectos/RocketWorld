/**
 * Proven RocketSim ↔ Three.js coordinate bridge (CHUNK 00 / game.js).
 *
 * RocketSim: X = horizontal, Y = field length, Z = up
 * Three.js:  X = horizontal, Y = up,         Z = depth
 *
 * Three X = RS X
 * Three Y = RS Z
 * Three Z = -RS Y
 * Scale: meters = UU * (1/50)
 */

export const UU_TO_M = 1 / 50;

export function rsToThreeInto(
  x: number,
  y: number,
  z: number,
  out: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  out.x = x * UU_TO_M;
  out.y = z * UU_TO_M;
  out.z = -y * UU_TO_M;
  return out;
}

export function rsDirToThreeInto(
  x: number,
  y: number,
  z: number,
  out: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  out.x = x;
  out.y = z;
  out.z = -y;
  return out;
}

export const _tmpPos = { x: 0, y: 0, z: 0 };
export const _dirTmp = { x: 0, y: 0, z: 0 };

/**
 * rot9: Float32Array(9) or embind-style { get(i), delete() }
 * Layout: [forward(3), right(3), up(3)] in RocketSim space.
 */
export function rsRotToThreeQuat(
  _THREE: any,
  rot9: ArrayLike<number> | { get: (i: number) => number; delete?: () => void },
  outQuat: any,
  tmpMat: any,
  tmpX: any,
  tmpY: any,
  tmpZ: any
): any {
  const get = (i: number) =>
    typeof (rot9 as any).get === 'function'
      ? (rot9 as any).get(i)
      : (rot9 as ArrayLike<number>)[i];

  rsDirToThreeInto(get(0), get(1), get(2), _dirTmp);
  tmpX.set(_dirTmp.x, _dirTmp.y, _dirTmp.z);

  rsDirToThreeInto(get(3), get(4), get(5), _dirTmp);
  tmpY.set(_dirTmp.x, _dirTmp.y, _dirTmp.z);

  rsDirToThreeInto(get(6), get(7), get(8), _dirTmp);
  tmpZ.set(_dirTmp.x, _dirTmp.y, _dirTmp.z);

  tmpMat.makeBasis(tmpX, tmpY, tmpZ);
  outQuat.setFromRotationMatrix(tmpMat);

  if (typeof (rot9 as any).delete === 'function') {
    (rot9 as any).delete();
  }

  return outQuat;
}
