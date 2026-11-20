export const EXPORT_FORMATS = ['fbx', 'glb', 'gltf', 'obj', 'usd', 'usdz', 'stl'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_PRESETS: Record<string, { name: string; formats: ExportFormat[]; units: 'm' | 'cm' | 'mm'; up_axis: 'Y' | 'Z'; forward_axis: string; collision: boolean; notes: string[] }> = {
  blender: { name: 'Blender', formats: ['glb', 'fbx', 'obj', 'usd'], units: 'm', up_axis: 'Y', forward_axis: '-Z', collision: false,
    notes: ['GLB keeps PBR materials and textures in one file: File → Import → glTF 2.0.', 'FBX/OBJ reference textures in the Textures folder.'] },
  maya: { name: 'Autodesk Maya', formats: ['fbx', 'obj', 'usd'], units: 'cm', up_axis: 'Y', forward_axis: 'Z', collision: false,
    notes: ['Import the FBX (File → Import). Scene units are centimetres; FBX carries its unit scale.', 'Re-link textures from the Textures folder if Maya cannot find them.'] },
  unreal: { name: 'Unreal Engine', formats: ['fbx', 'usd', 'glb'], units: 'cm', up_axis: 'Z', forward_axis: '-Y', collision: true,
    notes: ['Import FBX/<Name>.fbx. The UCX_ mesh in the same file becomes the simple collision.', 'Import LOD FBX files from the LOD settings of the Static Mesh editor (LOD Import).', 'Base colour is sRGB; the normal map is OpenGL (+Y) — enable "Flip Green Channel" on the normal texture.'] },
  unity: { name: 'Unity', formats: ['fbx', 'obj', 'glb'], units: 'm', up_axis: 'Y', forward_axis: '-Z', collision: true,
    notes: ['Drag the FBX folder and Textures into Assets. Transform is baked so scale is 1 and rotation 0.', 'Use the _collision mesh with a MeshCollider (Convex).', 'Set the normal texture Texture Type to "Normal map" (OpenGL convention matches Unity).'] },
  godot: { name: 'Godot', formats: ['glb', 'gltf'], units: 'm', up_axis: 'Y', forward_axis: '-Z', collision: true,
    notes: ['Copy the GLB into the project; Godot imports glTF natively with materials.', 'Use the _collision GLB for a ConvexPolygonShape3D.'] },
  universal: { name: 'Universal', formats: ['glb', 'gltf', 'obj', 'stl', 'usdz'], units: 'm', up_axis: 'Y', forward_axis: '-Z', collision: false,
    notes: ['GLB/GLTF: most viewers and engines.', 'USDZ: Apple AR Quick Look.', 'STL: geometry only, for 3D printing.'] },
};
