import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Line, useGLTF  } from '@react-three/drei'
import { useState, useRef, useCallback } from 'react'
import * as THREE from 'three'
import modelData from './model.json'
import './App.css'

function updateTransform(meshRef, obj, type, delta) {
  if (!obj || !meshRef.current) return
  const speed = type === 'move' ? 1 : Math.PI
  const step = Math.sign(obj.remaining) * Math.min(Math.abs(obj.remaining), speed * delta)

  if (type === 'move') meshRef.current.position[obj.axis] += step
  else meshRef.current.rotation.y += step

  obj.remaining -= step
  if (Math.abs(obj.remaining) < 0.001) obj.resolve()
}

function Car({ box }) {
  const gltf = useGLTF('/models/car.glb') // path from public folder or adjust
  const scaleFactor = 1.0 // adjust to fit the box

  if (!box) return null

  const carY = box.y + box.height / 2 + 0.8 // 0.8 = approximate half height of car
  return (
    <primitive
      object={gltf.scene}
      position={[box.x, carY, box.z]}
      scale={scaleFactor}
      rotation={[0, Math.PI, 0]} // rotate if needed
    />
  )
}

export function Shape({ box, isSelected, onSelect, moving, rotating, carsOnBoxes, onDoubleClick }) {
  const meshRef = useRef()

  // Determine color based on selection and car
  let color = box.color || 'limegreen'

  if (carsOnBoxes[box.id]) color = 'orange'   // car present → orange
  if (isSelected) color = 'yellow'           // selected → yellow overrides orange/limegreen

  useFrame((state, delta) => {
    updateTransform(meshRef, moving[box.id], 'move', delta)
    updateTransform(meshRef, rotating[box.id], 'rotate', delta)
  })

  const handleClick = useCallback(
    (e) => {
      e.stopPropagation()
      onSelect(box.id)
    },
    [box.id, onSelect]
  )

  const handleDoubleClick = useCallback(
    (e) => {
      e.stopPropagation()
      onDoubleClick(meshRef.current)
    },
    [onDoubleClick]
  )

  return (
    <mesh ref={meshRef} position={[box.x, box.y, box.z]} onClick={handleClick} onDoubleClick={handleDoubleClick}>
      <boxGeometry args={[box.width, box.height, box.depth]} />
      <meshStandardMaterial color={color} transparent opacity={0.8} />
    </mesh>
  )
}

function LineSegments({ segments, color }) {
  return (
    <>
      {segments.map((seg, i) => (
        <Line
          key={i}
          points={seg}
          color={color || 'white'}
          lineWidth={2}
        />
      ))}
    </>
  )
}

function Circle({ center, radius, segments, color }) {
  const points = []
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    const x = center[0] + radius * Math.cos(angle)
    const z = center[2] + radius * Math.sin(angle)
    points.push([x, center[1], z])
  }
  return <Line points={points} color={color || 'lightgray'} lineWidth={1} />
}

// 🔹 Expand grid definitions into boxes
function expandGrid(floor) {
  const boxes = []
  for (let r = 0; r < floor.rows; r++) {
    for (let c = 0; c < floor.cols; c++) {
      if (floor.grid[r][c] === 1) {
        const rowLabel = floor.rowLabels?.[r] || r
        const colLabel = String(c + 1)  
        const id = `${rowLabel}${colLabel}`

        boxes.push({
          id,
          type: 'box',
          x: c * floor.cellWidth + floor.cellWidth / 2,
          y: floor.y,
          z: r * floor.cellDepth + floor.cellDepth / 2,
          width: floor.box.width,
          height: floor.box.height,
          depth: floor.box.depth,
          color: floor.box.color,
        })
      }
    }
  }
  return boxes
}

export default function App() {
  // 🔹 Build expanded items list once
  const [items] = useState(() => {
    const expanded = []
    modelData.forEach(item => {
      if (item.type === 'grid') {
        expanded.push(...expandGrid(item))
      } else {
        expanded.push(item)
      }
    })
    return expanded
  })

  const [selectedBoxId, setSelectedBoxId] = useState(null)
  const [axis, setAxis] = useState('x')
  const [distance, setDistance] = useState(0)
  const [moving, setMoving] = useState({})
  const [rotating, setRotating] = useState({})
  const [carsOnBoxes, setCarsOnBoxes] = useState({}) // keys = box IDs, values = true/false

  const controlsRef = useRef()

  const handleZoomToBox = (mesh) => {
    if (!controlsRef.current || !mesh) return

    const boxPos = mesh.position
    const offset = 5
    const target = new THREE.Vector3().copy(boxPos)
    const cameraPos = new THREE.Vector3(boxPos.x, boxPos.y + offset, boxPos.z + offset * 2)

    controlsRef.current.target.copy(target)
    controlsRef.current.object.position.copy(cameraPos)
    controlsRef.current.update()
  }

  const toggleCar = (boxId) => {
    setCarsOnBoxes(prev => ({
      ...prev,
      [boxId]: !prev[boxId] // flip true/false
    }))
  }

  const handleMove = () => {
    if (!selectedBoxId) {
      alert('No pallet selected!')
      return
    }
    const dist = parseFloat(distance)
    if (isNaN(dist) || dist === 0) return

    // Don’t allow move if already rotating or moving
    if (moving[selectedBoxId] || rotating[selectedBoxId]) return

    const moveObj = {
      axis,
      remaining: dist,
      resolve: () => {
        setMoving(prev => {
          const next = { ...prev }
          delete next[selectedBoxId]
          return next
        })
      },
    }

    setMoving(prev => ({ ...prev, [selectedBoxId]: moveObj }))
  }

  const handleRotate = () => {
    if (!selectedBoxId) {
      alert('No pallet selected!')
      return
    }

    // Don’t allow rotate if already rotating or moving
    if (rotating[selectedBoxId] || moving[selectedBoxId]) return

    const rotateObj = {
      remaining: Math.PI,
      resolve: () => {
        setRotating(prev => {
          const next = { ...prev }
          delete next[selectedBoxId]
          return next
        })
      },
    }

    setRotating(prev => ({ ...prev, [selectedBoxId]: rotateObj }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* Canvas */}
      <div className="canvas-container">
        <Canvas camera={{ position: [45, 20, 40], fov: 75 }}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          <OrbitControls ref={controlsRef} target={[45, 10, 20]} enablePan={true} />
          {items.map(item =>
            item.type === 'box' ? (
              <Shape
                key={item.id}
                box={item}
                isSelected={item.id === selectedBoxId}
                onSelect={setSelectedBoxId}
                moving={moving}
                rotating={rotating}
                toggleCar={toggleCar}
                carsOnBoxes={carsOnBoxes}
                onDoubleClick={handleZoomToBox}
              />
            ) : item.type === 'lines' ? (
              <LineSegments key={item.id} segments={item.segments} color={item.color} />
            ) : item.type === 'circle' ? (
              <Circle key={item.id} center={item.center} radius={item.radius} segments={item.segments} color={item.color} />
            ) : null
          )}
        </Canvas>
      </div>

      {/* Controls panel */}
      <div className="controls-panel">
        <label>
          Select Pallet:
          <select value={selectedBoxId || ''} onChange={e => setSelectedBoxId(e.target.value)}>
            <option value="">--None--</option>
            {items
              .filter(b => b.type === 'box')
              .map(b => (
                <option key={b.id} value={b.id}>{b.id}</option>
              ))}
          </select>
        </label>

        <label>
          Axis:
          <select value={axis} onChange={e => setAxis(e.target.value)}>
            <option value="x">X</option>
            <option value="y">Y</option>
            <option value="z">Z</option>
          </select>
        </label>

        <label>
          Distance:
          <input type="number" step="0.01" value={distance} onChange={e => setDistance(e.target.value)} />
        </label>

        <button onClick={handleMove}>Move</button>
        <button onClick={handleRotate}>Rotate 180° CCW</button>
        <button
          onClick={() => {
            if (!selectedBoxId) {
              alert('No pallet selected!')
              return
            }
            toggleCar(selectedBoxId)
          }}
        >
          {carsOnBoxes[selectedBoxId] ? 'Remove Car' : 'Add Car'}
        </button>
      </div>
    </div>
  )
}
