/**
 * Instanced cubic honeycomb: instanceMatrix_i = inverse(P) · G_i (float64 → float32).
 */
import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
} from "three";
import {
  type Kappa,
  type Mat4,
  type Vec4,
  ORIGIN,
  apply,
  distance,
  inverse,
  mul,
  writeMat4f32,
} from "../geometry/lorentz.ts";
import {
  type Cell,
  type Lattice,
  cellsInRadius,
  generateLattice,
  isLandmark,
  visRadiusFor,
} from "../geometry/lattice.ts";
import { buildCellGeometry, buildOrbGeometry } from "../geometry/tube.ts";
import {
  attachPerEyeUniform,
  createSpaceMaterial,
  setMaterialWorld,
} from "../render/material.ts";

const tmpInv = new Float64Array(16) as Mat4;
const tmpInst = new Float64Array(16) as Mat4;
const tmpMat = new Matrix4();
const playerPos: Vec4 = new Float64Array(4) as Vec4;

export interface WorldStats {
  instances: number;
  triangles: number;
}

export class LatticeWorld {
  lattice: Lattice;
  mesh: InstancedMesh;
  landmarks: InstancedMesh;
  visRadius: number;
  kappa: Kappa;
  private triPerCell = 0;

  constructor(kappa: Kappa, K: number, bg: Color) {
    this.kappa = kappa;
    this.lattice = generateLattice(kappa, {
      maxCells: kappa > 0 ? 8 : kappa === 0 ? 1331 : 4000,
      maxDepth: kappa > 0 ? 8 : kappa === 0 ? 6 : 10,
    });
    this.visRadius = visRadiusFor(kappa);
    const geo = buildCellGeometry(kappa);
    this.triPerCell = (geo.getIndex()?.count ?? 0) / 3;
    const mat = createSpaceMaterial(kappa, K, bg);
    const n = this.lattice.cells.length;
    this.mesh = new InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    attachPerEyeUniform(this.mesh as never);

    const lgeo = buildOrbGeometry(kappa, 0.11);
    const lmat = createSpaceMaterial(kappa, K, bg);
    this.landmarks = new InstancedMesh(lgeo, lmat, n);
    this.landmarks.frustumCulled = false;
    this.landmarks.instanceMatrix.setUsage(DynamicDrawUsage);
    this.landmarks.count = 0;
    attachPerEyeUniform(this.landmarks as never);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as { dispose: () => void }).dispose();
    this.landmarks.geometry.dispose();
    (this.landmarks.material as { dispose: () => void }).dispose();
    this.mesh.removeFromParent();
    this.landmarks.removeFromParent();
  }

  setK(K: number, bg: Color): void {
    setMaterialWorld(this.mesh.material as never, this.kappa, K, bg);
    setMaterialWorld(this.landmarks.material as never, this.kappa, K, bg);
  }

  update(P: Mat4): WorldStats {
    apply(P, ORIGIN, playerPos);
    inverse(P, this.kappa, tmpInv);
    const visible: Cell[] = cellsInRadius(this.lattice, playerPos, this.visRadius, distance);
    this.mesh.count = visible.length;
    let lm = 0;
    for (let i = 0; i < visible.length; i++) {
      const cell = visible[i];
      mul(tmpInv, cell.G, tmpInst);
      writeMat4f32(tmpInst, tmpMat.elements);
      this.mesh.setMatrixAt(i, tmpMat);
      const col = cellColor(cell, this.kappa);
      this.mesh.setColorAt(i, col);
      if (isLandmark(cell.center)) {
        this.landmarks.setMatrixAt(lm, tmpMat);
        this.landmarks.setColorAt(lm, landmarkColor(cell.id));
        lm++;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.landmarks.count = lm;
    this.landmarks.instanceMatrix.needsUpdate = true;
    if (this.landmarks.instanceColor) this.landmarks.instanceColor.needsUpdate = true;
    return {
      instances: visible.length,
      triangles: visible.length * this.triPerCell + lm * 8,
    };
  }

  get Pinv(): Mat4 {
    return tmpInv;
  }
}

const _c = new Color();
function cellColor(cell: Cell, kappa: Kappa): Color {
  const hue =
    kappa < 0 ? 0.52 + cell.depth * 0.035 : kappa > 0 ? 0.08 + cell.depth * 0.04 : 0.6 + (cell.id % 7) * 0.02;
  const sat = 0.45 + (cell.id % 5) * 0.06;
  const lit = 0.55 - cell.depth * 0.03;
  return _c.setHSL(hue % 1, sat, Math.max(0.28, lit));
}

const _l = new Color();
function landmarkColor(id: number): Color {
  return _l.setHSL((id * 0.17) % 1, 0.75, 0.62);
}
