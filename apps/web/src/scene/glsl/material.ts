import * as THREE from 'three';

type Uniforms = Record<string, THREE.IUniform>;

/** ShaderMaterial com os uniforms de névoa do three já incluídos (`fog: true`). */
export function foggyShader(
  params: Omit<THREE.ShaderMaterialParameters, 'uniforms' | 'fog'> & { uniforms: Uniforms },
): THREE.ShaderMaterial {
  const { uniforms, ...rest } = params;
  return new THREE.ShaderMaterial({
    ...rest,
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...uniforms },
  });
}
