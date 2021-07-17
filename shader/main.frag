precision mediump float;

uniform vec3 lightDirection;

varying vec3 vNormal;

void main(){
    // ライトベクトルと法線は念の為、単位化しておく
    vec3 light = normalize(lightDirection);
    vec3 normal = normalize(vNormal);

    // 平行光源に対する拡散光を計算する
    float diffuse = max(dot(light, normal), 0.0);

    // RGB の要素に拡散光の計算結果を出力する
    gl_FragColor = vec4(vec3(diffuse), 1.0);
}

