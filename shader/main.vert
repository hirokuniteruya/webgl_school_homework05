attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;

uniform mat4 mvpMatrix;
uniform mat4 normalMatrix; // 法線変換用の行列

varying vec3 vNormal;
varying vec4 vColor;

void main(){
    // 法線を行列で変換してからフラグメントシェーダに送る @@@
    // ※このとき vec4 の第四成分は 0.0 にするのがポイント！
    vNormal = (normalMatrix * vec4(normal, 0.0)).xyz;
    vColor = color;

    gl_Position = mvpMatrix * vec4(position, 1.0);
}

