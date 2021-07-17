import { WebGLUtility, WebGLOrbitCamera, WebGLMath, Mat4, Vec3, Vec2, Qtn, WebGLGeometry } from './webgl.js';

(() => {
    // モジュール内コンスタント部
    const CLOCKHAND_HEIGHT = 1.2;

    // webgl.js に記載のクラスを扱いやすいよう変数に入れておく
    const webgl = new WebGLUtility(); // WebGL API をまとめたユーティリティ
    const m = Mat4;                   // 線型代数の各種算術関数群
    const geo = WebGLGeometry;        // 頂点ジオメトリを生成する関数群

    // WebGLRenderingContext を格納する変数
    let gl = null;

    // 複数の関数で利用する広いスコープが必要な変数を宣言しておく
    let startTime = 0;            // 描画開始時のタイムスタンプ
    let isEnableCulling = false;  // フェイスカリングを有効化するかどうか
    let isEnableDepthTest = true; // 深度テストを有効化するかどうか
    let isSphereRotation = false; // 球体を回転させるかどうか

    // 各ジオメトリの VBO, IBO, index を格納するオブジェクト
    let sphere    = {}; // 球体のジオメトリ情報
    let clockFace = {}; // 時計の文字盤
    let shaft     = {}; // シャフト（心棒）
    let clockHand = {} // 針

    let attLocation = null; // attribute location
    let attStride   = null; // 頂点属性のストライド
    let uniLocation = null; // uniform location

    let vMatrix     = null; // ビュー行列
    let pMatrix     = null; // プロジェクション行列
    let vpMatrix    = null; // ビュー x プロジェクション行列

    let camera      = null; // 自作オービットコントロール風カメラ

    // ドキュメントの読み込みが完了したら実行されるようイベントを設定する
    window.addEventListener('DOMContentLoaded', () => {
        // special thanks! https://github.com/cocopon/tweakpane ===============
        const PANE = new Tweakpane({
            container: document.querySelector('#float-layer'),
        });
        PANE.addInput({ 'face-culling': isEnableCulling }, 'face-culling')
            .on('change', v => { isEnableCulling = v; });
        PANE.addInput({'depth-test': isEnableDepthTest}, 'depth-test')
            .on('change', v => { isEnableDepthTest = v; });
        PANE.addInput({'sphere-rotation': isSphereRotation}, 'sphere-rotation')
            .on('change', v => { isSphereRotation = v; });
        // ====================================================================

        const canvas = document.getElementById('webgl-canvas');
        webgl.initialize(canvas);
        gl = webgl.gl;
        const size = Math.min(window.innerWidth, window.innerHeight);
        webgl.width  = size;
        webgl.height = size;

        // カメラのインスタンスを生成
        const cameraOption = {
            distance: 5.0,
            min: 1.0,
            max: 10.0,
            move: 2.0,
        };
        camera = new WebGLOrbitCamera(canvas, cameraOption);

        const promises = [
            WebGLUtility.loadFile('./shader/main.vert'),
            WebGLUtility.loadFile('./shader/main.frag'),
        ];
        Promise.all(promises).then(shaderSources => {
            const vs = webgl.createShaderObject(shaderSources[0], gl.VERTEX_SHADER);
            const fs = webgl.createShaderObject(shaderSources[1], gl.FRAGMENT_SHADER);
            webgl.program = webgl.createProgramObject(vs, fs);

            setupGeometry();
            setupLocation();
            startTime = Date.now();
            render();
        });
    }, false);

    /**
     * 頂点属性（頂点ジオメトリ）のセットアップを行う
     */
    function setupGeometry(){
        // 球体ジオメトリ情報と VBO、IBO の生成
        // const sphereData = geo.sphere(32, 32, 1.0, [1.0, 1.0, 1.0, 1.0]);
        // sphere.vbo = [
        //     webgl.createVBO(sphereData.position),
        //     webgl.createVBO(sphereData.normal),
        // ];
        // sphere.ibo = webgl.createIBO(sphereData.index);
        // sphere.index = sphereData.index;

        // 時計の文字盤
        // const clockFaceData = geo.circle(64, 1.2, [1.0, 1.0, 1.0, 1.0]);
        const clockFaceData = createClockFace(64, 1.2, [0.8, 1.0, 1.0, 1.0]);
        clockFace.vbo = [
            webgl.createVBO(clockFaceData.position),
            webgl.createVBO(clockFaceData.normal),
            webgl.createVBO(clockFaceData.color),
        ];
        clockFace.ibo = webgl.createIBO(clockFaceData.index);
        clockFace.index = clockFaceData.index;

        // シャフト
        const shaftData = geo.cylinder(8, 0.08, 0.15, 0.4, [1.0, 1.0, 1.0, 1.0]);
        shaft.vbo = [
            webgl.createVBO(shaftData.position),
            webgl.createVBO(shaftData.normal),
            webgl.createVBO(shaftData.color),
        ];
        shaft.ibo = webgl.createIBO(shaftData.index);
        shaft.index = shaftData.index;

        // 針
        const clockHandData = geo.cylinder(4, 0.02, 0.03, CLOCKHAND_HEIGHT, [0.0, 0.0, 1.0, 1.0]);
        // const clockHandData = geo.plane(0.05, CLOCKHAND_HEIGHT, [0.0, 1.0, 0.0, 1.0]);
        clockHand.vbo = [
            webgl.createVBO(clockHandData.position),
            webgl.createVBO(clockHandData.normal),
            webgl.createVBO(clockHandData.color),
        ];
        clockHand.ibo = webgl.createIBO(clockHandData.index);
        clockHand.index = clockHandData.index;
    }

    /**
     * 頂点属性のロケーションに関するセットアップを行う
     */
    function setupLocation(){
        // attribute location の取得と有効化
        attLocation = [
            gl.getAttribLocation(webgl.program, 'position'),
            gl.getAttribLocation(webgl.program, 'normal'),
            gl.getAttribLocation(webgl.program, 'color'),
        ];
        attStride = [3, 3, 4];
        // uniform 変数のロケーションの取得
        uniLocation = {
            mvpMatrix: gl.getUniformLocation(webgl.program, 'mvpMatrix'),
            normalMatrix: gl.getUniformLocation(webgl.program, 'normalMatrix'), // 法線変換用行列
            lightDirection: gl.getUniformLocation(webgl.program, 'lightDirection'),
        };
    }

    /**
     * レンダリングのためのセットアップを行う
     */
    function setupRendering(){
        gl.viewport(0, 0, webgl.width, webgl.height);
        gl.clearColor(0.7, 0.7, 0.7, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (isEnableCulling === true) {
            gl.enable(gl.CULL_FACE);
        } else {
            gl.disable(gl.CULL_FACE);
        }
        if (isEnableDepthTest === true) {
            gl.enable(gl.DEPTH_TEST);
        } else {
            gl.disable(gl.DEPTH_TEST);
        }

        // ビュー x プロジェクション行列を生成
        vMatrix = camera.update();
        const fovy = 45;
        const aspect = webgl.width / webgl.height;
        const near = 0.1;
        const far = 20.0;
        pMatrix = m.perspective(fovy, aspect, near, far);
        vpMatrix = m.multiply(pMatrix, vMatrix);
    }

    /**
     * レンダリングを行う
     */
    function render(){
        // 再帰呼び出しを行う
        requestAnimationFrame(render);

        // 時間の計測
        const nowTime = (Date.now() - startTime) / 1000;

        // レンダリング時のクリア処理など
        setupRendering();

        /* オブジェクトのレンダリング記述域 */
        // メッシュを更新し描画を行う
        renderMesh(nowTime);
    }

    /**
     * メッシュ情報の更新と描画を行う
     * @param {number} time - 経過時間
     */
     function renderMesh(time){
        // ライトベクトルを uniform 変数としてシェーダに送る
        gl.uniform3fv(uniLocation.lightDirection, [1.0, 1.0, 1.0]);

        let mMatrix = m.create();
        let normalMatrix = null;
        let mvpMatrix = null;

        const d = new Date();
        // const angle_hour = 2 * Math.PI * ( d.getHours()   / 12 );
        // const angle_min  = 2 * Math.PI * ( d.getMinutes() / 60 );
        const angle_sec  = 2 * Math.PI * ( d.getSeconds() / 60 );

        /* 球体 */
        // mMatrix = m.identity(mMatrix);
        // if (isSphereRotation === true) {
        //     mMatrix = m.rotate(mMatrix, time, [0.0, 1.0, 0.0]);
        // }
        // normalMatrix = m.transpose(m.inverse(mMatrix));
        // mvpMatrix = m.multiply(vpMatrix, mMatrix);
        // gl.uniformMatrix4fv(uniLocation.normalMatrix, false, normalMatrix);
        // gl.uniformMatrix4fv(uniLocation.mvpMatrix, false, mvpMatrix);
        // drawElements(sphere);

        /* 時計の文字盤 */
        mMatrix = m.identity(mMatrix);
        mMatrix = m.translate(mMatrix, [0.0, 0.0, -0.1]);
        normalMatrix = m.transpose(m.inverse(mMatrix));
        mvpMatrix = m.multiply(vpMatrix, mMatrix);
        gl.uniformMatrix4fv(uniLocation.normalMatrix, false, normalMatrix);
        gl.uniformMatrix4fv(uniLocation.mvpMatrix, false, mvpMatrix);
        drawElements(clockFace);

        /* シャフト */
        mMatrix = m.identity(mMatrix);
        if (isSphereRotation === true) {
            mMatrix = m.rotate(mMatrix, time, [0.0, 0.0, 1.0]);
        }
        mMatrix = m.rotate(mMatrix, Math.PI / 2, [1.0, 0.0, 0.0]);
        normalMatrix = m.transpose(m.inverse(mMatrix));
        mvpMatrix = m.multiply(vpMatrix, mMatrix);
        gl.uniformMatrix4fv(uniLocation.normalMatrix, false, normalMatrix);
        gl.uniformMatrix4fv(uniLocation.mvpMatrix, false, mvpMatrix);
        drawElements(shaft);

        /* 針 */
        mMatrix = m.identity(mMatrix);
        if (isSphereRotation === true) {
            mMatrix = m.rotate(mMatrix, time, [0.0, 0.0, 1.0]);
        }
        mMatrix = m.rotate(mMatrix, angle_sec, [0.0, 0.0, -1.0]);
        mMatrix = m.translate(mMatrix, [0.0, CLOCKHAND_HEIGHT / 2 - 0.2, 0.0]);
        normalMatrix = m.transpose(m.inverse(mMatrix));
        mvpMatrix = m.multiply(vpMatrix, mMatrix);
        gl.uniformMatrix4fv(uniLocation.normalMatrix, false, normalMatrix);
        gl.uniformMatrix4fv(uniLocation.mvpMatrix, false, mvpMatrix);
        drawElements(clockHand);

    }

    /**
     * VBO, IBO のバインドと、バインド中の頂点の描画を行う
     * @param {object} geoData - ジオメトリの VBO, IBO, index を格納したオブジェクト
     */
    function drawElements(geoData) {
        // 物体の VBO と IBO をバインドする
        webgl.enableAttribute(geoData.vbo, attLocation, attStride);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geoData.ibo);
        // バインド中の頂点を描画する
        gl.drawElements(gl.TRIANGLES, geoData.index.length, gl.UNSIGNED_SHORT, 0);
    }
})();

/**
 * WebGLGeometry.circle メソッドの法線の改造版
 * @param {number} split - 分割数
 * @param {number} rad - 半径
 * @param {Array.<number>} color - 色
 * @returns 時計の文字盤のオブジェクト
 */
function createClockFace(split, rad, color){
    let i, j = 0;
    let pos = [], nor = [],
        col = [], st  = [], idx = [];
    pos.push(0.0, 0.0, 0.0);
    nor.push(0.0, 0.0, 1.0);
    col.push(color[0], color[1], color[2], color[3]);
    st.push(0.5, 0.5);
    for(i = 0; i < split; i++){
        let r = Math.PI * 2.0 / split * i;
        let rx = Math.cos(r);
        let ry = Math.sin(r);
        pos.push(rx * rad, ry * rad, 0.0);
        nor.push(rx / 1.8, ry / 1.8, 1.0);
        col.push(color[0], color[1], color[2], color[3]);
        st.push((rx + 1.0) * 0.5, 1.0 - (ry + 1.0) * 0.5);
        if(i === split - 1){
            idx.push(0, j + 1, 1);
        }else{
            idx.push(0, j + 1, j + 2);
        }
        ++j;
    }
    return {position: pos, normal: nor, color: col, texCoord: st, index: idx}
}
