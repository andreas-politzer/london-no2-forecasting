import type { Matrix } from './linear'

// Gradient boosting with small regression trees (squared error). Own code, so
// it runs in the browser; it is similar to, but not the same as, scikit-learn's
// histogram boosting, and is called "Boosting (Browser)" in the interface.
// Deterministic: no random choices anywhere.
//   - Each column is cut into at most `maxBins` bins using the training rows.
//   - Each tree is grown level by level, a split must leave `minLeaf` rows on
//     both sides and must reduce the squared error.
//   - Each tree predicts the remaining error; a fraction `rate` of it is added.

export type BoostParams = { trees: number; depth: number; rate: number; minLeaf: number; maxBins: number }

type Tree = {
  feature: Int32Array // -1 = leaf
  cut: Float64Array // go left when value <= cut
  left: Int32Array
  right: Int32Array
  value: Float64Array
}

export type BoostModel = {
  base: number
  trees: Tree[]
  predict: (x: Matrix) => Float64Array
}

// Cut points of one column (strictly increasing). At most maxBins - 1 cuts.
export function binCuts(values: ArrayLike<number>, maxBins: number): number[] {
  const sorted = Float64Array.from(values).sort()
  const unique: number[] = []
  for (const v of sorted) if (unique.length === 0 || v > unique[unique.length - 1]) unique.push(v)
  if (unique.length <= maxBins) {
    return unique.slice(1).map((v, i) => (unique[i] + v) / 2)
  }
  const cuts: number[] = []
  const n = sorted.length
  for (let q = 1; q < maxBins; q += 1) {
    const index = Math.floor((q * n) / maxBins)
    // Midpoint of the two neighbours at the quantile; inside a block of equal
    // values this is the value itself ("value <= cut" then keeps the block
    // together). A cut at the largest value would leave an empty bin.
    const cut = (sorted[index - 1] + sorted[index]) / 2
    if (cut >= sorted[n - 1]) continue
    if (cuts.length === 0 || cut > cuts[cuts.length - 1]) cuts.push(cut)
  }
  return cuts
}

function binOf(value: number, cuts: number[]): number {
  let lo = 0
  let hi = cuts.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (value > cuts[mid]) lo = mid + 1
    else hi = mid
  }
  return lo
}

const MIN_GAIN = 1e-12

type Frame = { rows: Int32Array; depth: number; node: number }

function growTree(
  bins: Uint8Array[],
  cuts: number[][],
  residual: Float64Array,
  params: BoostParams,
  leafOf: Float64Array,
): Tree {
  const feature: number[] = []
  const cut: number[] = []
  const left: number[] = []
  const right: number[] = []
  const value: number[] = []
  const newNode = () => {
    feature.push(-1)
    cut.push(0)
    left.push(-1)
    right.push(-1)
    value.push(0)
    return feature.length - 1
  }
  const root = newNode()
  const all = Int32Array.from({ length: residual.length }, (_, i) => i)
  const stack: Frame[] = [{ rows: all, depth: 0, node: root }]
  const p = bins.length

  while (stack.length > 0) {
    const { rows, depth, node } = stack.pop() as Frame
    const n = rows.length
    let total = 0
    for (let i = 0; i < n; i += 1) total += residual[rows[i]]
    let bestGain = MIN_GAIN
    let bestFeature = -1
    let bestBin = -1
    if (depth < params.depth && n >= 2 * params.minLeaf) {
      const parent = (total * total) / n
      for (let j = 0; j < p; j += 1) {
        const nb = cuts[j].length + 1
        if (nb < 2) continue
        const sum = new Float64Array(nb)
        const cnt = new Float64Array(nb)
        const column = bins[j]
        for (let i = 0; i < n; i += 1) {
          const b = column[rows[i]]
          sum[b] += residual[rows[i]]
          cnt[b] += 1
        }
        let sl = 0
        let nl = 0
        for (let b = 0; b < nb - 1; b += 1) {
          sl += sum[b]
          nl += cnt[b]
          const nr = n - nl
          if (nl < params.minLeaf || nr < params.minLeaf) continue
          const sr = total - sl
          const gain = (sl * sl) / nl + (sr * sr) / nr - parent
          if (gain > bestGain) {
            bestGain = gain
            bestFeature = j
            bestBin = b
          }
        }
      }
    }
    if (bestFeature < 0) {
      const mean = n === 0 ? 0 : total / n
      value[node] = mean
      for (let i = 0; i < n; i += 1) leafOf[rows[i]] = mean
      continue
    }
    const column = bins[bestFeature]
    let nLeft = 0
    for (let i = 0; i < n; i += 1) if (column[rows[i]] <= bestBin) nLeft += 1
    const leftRows = new Int32Array(nLeft)
    const rightRows = new Int32Array(n - nLeft)
    let a = 0
    let b = 0
    for (let i = 0; i < n; i += 1) {
      if (column[rows[i]] <= bestBin) leftRows[a++] = rows[i]
      else rightRows[b++] = rows[i]
    }
    feature[node] = bestFeature
    cut[node] = cuts[bestFeature][bestBin]
    const l = newNode()
    const r = newNode()
    left[node] = l
    right[node] = r
    stack.push({ rows: rightRows, depth: depth + 1, node: r }, { rows: leftRows, depth: depth + 1, node: l })
  }
  return {
    feature: Int32Array.from(feature),
    cut: Float64Array.from(cut),
    left: Int32Array.from(left),
    right: Int32Array.from(right),
    value: Float64Array.from(value),
  }
}

function treeValue(tree: Tree, x: Float64Array, offset: number): number {
  let node = 0
  while (tree.feature[node] >= 0) {
    node = x[offset + tree.feature[node]] <= tree.cut[node] ? tree.left[node] : tree.right[node]
  }
  return tree.value[node]
}

export function fitBoosting(x: Matrix, y: Float64Array, params: BoostParams): BoostModel | null {
  const { n, p } = x
  if (n === 0 || p === 0) return null
  const cuts: number[][] = []
  const bins: Uint8Array[] = []
  for (let j = 0; j < p; j += 1) {
    const column = new Float64Array(n)
    for (let i = 0; i < n; i += 1) column[i] = x.data[i * p + j]
    const c = binCuts(column, params.maxBins)
    cuts.push(c)
    const b = new Uint8Array(n)
    for (let i = 0; i < n; i += 1) b[i] = binOf(column[i], c)
    bins.push(b)
  }
  let base = 0
  for (let i = 0; i < n; i += 1) base += y[i]
  base /= n

  const fit = new Float64Array(n).fill(base)
  const residual = new Float64Array(n)
  const leafOf = new Float64Array(n)
  const trees: Tree[] = []
  for (let m = 0; m < params.trees; m += 1) {
    for (let i = 0; i < n; i += 1) residual[i] = y[i] - fit[i]
    const tree = growTree(bins, cuts, residual, params, leafOf)
    for (let i = 0; i < n; i += 1) fit[i] += params.rate * leafOf[i]
    trees.push(tree)
  }
  const rate = params.rate
  const predict = (m: Matrix): Float64Array => {
    const out = new Float64Array(m.n)
    for (let i = 0; i < m.n; i += 1) {
      let value = base
      for (const tree of trees) value += rate * treeValue(tree, m.data, i * m.p)
      out[i] = value
    }
    return out
  }
  return { base, trees, predict }
}
