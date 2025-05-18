import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Water } from "three/examples/jsm/objects/Water.js";
import { TextureLoader } from "three";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9a9a9);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(50, 50, 0);
camera.lookAt(0, 1, 0);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
document.body.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(-1, 2, 3);
scene.add(light);

const wallMaterial = new THREE.MeshBasicMaterial({ color: 0xf5deb3 });
const wallThickness = 0.2;
const wallHeight = 2;
const wallLength = 3;
const roofLength = wallLength + 0.2;
const roofWidth = wallLength + 0.2;
const roofThickness = 0.2;
const roofHeight = 1.5;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let houses = [];
let houseCount = 0;
let houseWidth = 3;
let houseLength = 3;
let houseHeight = 2;

let tornadoParts = [];
let collapsedParts = [];
let tornadoActive = false;
let tornadoDirection = new THREE.Vector3();
let waitingForTornadoClick = false;
let tornadoStage = 0;
let earthquakeActive = false;
let earthquakeTimer = 0;
let tsunamiWater;
let tsunamiActive = false;
let tsunamiStage = 0;
let tsunamiDirection = new THREE.Vector3();
let waitingForLightning = false;
let lightningBolt;
let lightningTimer = 0;
let burningHouses = [];
let waitingToPlaceHouse = false;

const fireTexture = new THREE.TextureLoader().load(
  "https://threejs.org/examples/textures/sprites/spark1.png"
);
function igniteHouse(house) {
  if (house.userData.burning) return;

  house.userData.burning = true;
  house.userData.fireTimer = 0;
  house.userData.fireParticles = [];
  house.userData.originalParts = house.children.slice();

  const fireLight = new THREE.PointLight(0xff2200, 1, 10);
  fireLight.position.copy(house.position).add(new THREE.Vector3(0, 2, 0));
  scene.add(fireLight);
  house.userData.fireLight = fireLight;
}

function updateFires() {
  for (let i = burningHouses.length - 1; i >= 0; i--) {
    const house = burningHouses[i];
    const data = house.userData;
    data.fireTimer += 0.01;
    const timer = data.fireTimer;

    data.originalParts.forEach((part) => {
      if (part.scale.y > 0.2) {
        part.scale.y -= 0.001;
        part.position.y -= 0.0005;
      }
      part.material.color.lerp(new THREE.Color(0x111111), 0.01);
    });

    if (data.fireLight) {
      data.fireLight.intensity = 1 + Math.sin(performance.now() * 0.02);
    }

    if (Math.random() < 0.3) {
      const particle = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: fireTexture,
          color: 0xff6600,
          transparent: true,
          opacity: 0.8,
        })
      );
      particle.position
        .copy(house.position)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            1 + Math.random() * 2,
            (Math.random() - 0.5) * 2
          )
        );
      particle.scale.set(1.2, 1.2, 1.2);
      scene.add(particle);
      data.fireParticles.push(particle);
    }

    data.fireParticles = data.fireParticles.filter((p) => {
      p.position.y += 0.02;
      p.material.opacity -= 0.01;
      if (p.material.opacity <= 0) {
        scene.remove(p);
        return false;
      }
      return true;
    });

    if (timer > 3 && timer < 4) {
      houses.forEach((other) => {
        if (
          other !== house &&
          !other.userData.burning &&
          other.position.distanceTo(house.position) < 10
        ) {
          igniteHouse(other);
          burningHouses.push(other);
        }
      });
    }

    if (timer > 8) {
      collapseHouse(house);
      data.burning = false;
      if (data.fireLight) {
        scene.remove(data.fireLight);
        data.fireLight = null;
      }
      burningHouses.splice(i, 1);
    }
  }
}

const lightningMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 1,
});

function createLightningBolt(start, end, segments = 20, jaggedness = 2) {
  const positions = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = new THREE.Vector3().lerpVectors(start, end, t);

    if (i > 0 && i < segments) {
      point.x += Math.random() * jaggedness * 5;
      point.z += Math.random() * jaggedness * 5;
    }

    positions.push(point.x, point.y, point.z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );

  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    linewidth: 5,
    transparent: true,
    opacity: 1,
  });

  return new THREE.Line(geometry, material);
}
const waterGeometry = new THREE.PlaneGeometry(30, 10, 100, 100);
const waterNormalMap = new TextureLoader().load(
  "https://threejs.org/examples/textures/waternormals.jpg"
);
waterNormalMap.wrapS = waterNormalMap.wrapT = THREE.RepeatWrapping;
const waterMaterial = new THREE.MeshStandardMaterial({
  color: 0x1ca3ec,
  metalness: 0.3,
  roughness: 0.4,
  transparent: true,
  opacity: 0.7,
  side: THREE.DoubleSide,
  displacementMap: waterNormalMap,
  displacementScale: 1.5,
});
const waveMesh = new THREE.Mesh(waterGeometry, waterMaterial);
waveMesh.rotation.x = -Math.PI / 2;
waveMesh.visible = false;
scene.add(waveMesh);
tsunamiWater = new Water(waterGeometry, {
  textureWidth: 512,
  textureHeight: 512,
  waterNormals: waterNormalMap,
  sunDirection: new THREE.Vector3(),
  sunColor: 0xffffff,
  waterColor: 0x1ca3ec,
  distortionScale: 3.7,
  fog: false,
});
tsunamiWater.rotation.x = -Math.PI / 2;
tsunamiWater.visible = false;
scene.add(tsunamiWater);

const tornado = new THREE.Mesh(
  new THREE.CylinderGeometry(4, 0.8, 10, 32),
  new THREE.MeshBasicMaterial({
    color: 0x5555ff,
    transparent: true,
    opacity: 0.6,
  })
);
tornado.position.set(-10, 2.5, 0);
tornado.visible = false;
scene.add(tornado);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshBasicMaterial({ color: 0x228b22 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.zoomSpeed = 1.2;
controls.minDistance = 2;
controls.maxDistance = 100;
controls.target.set(0, 1, 0);

function createHouse(position = new THREE.Vector3(0, 0, 0)) {
  const house = new THREE.Object3D();
  const randWall = (1 + Math.random()) * wallHeight;
  const freshWallMaterial = new THREE.MeshBasicMaterial({ color: 0xf5deb3 });
  const wall1 = new THREE.Mesh(
    new THREE.BoxGeometry(wallLength, randWall, wallThickness),
    freshWallMaterial
  );

  wall1.position.set(0, randWall / 2, -wallLength / 2);

  const wall2 = wall1.clone();
  wall2.position.set(0, randWall / 2, wallLength / 2);

  const wall3 = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, randWall, wallLength),
    freshWallMaterial
  );
  wall3.position.set(-wallLength / 2, randWall / 2, 0);

  const wall4 = wall3.clone();
  wall4.position.set(wallLength / 2, randWall / 2, 0);

  house.add(wall1, wall2, wall3, wall4);

  const randomColor = new THREE.Color(
    Math.random(),
    Math.random(),
    Math.random()
  );
  const roofMaterial = new THREE.MeshBasicMaterial({ color: randomColor });

  const roof1 = new THREE.Mesh(
    new THREE.BoxGeometry(roofLength, roofThickness, roofWidth),
    roofMaterial
  );
  roof1.rotation.x = Math.PI / 4;
  roof1.position.set(0, randWall + roofHeight / 2, -roofThickness + 1.3);

  const roof2 = roof1.clone();
  roof2.rotation.x = -Math.PI / 4;
  roof2.position.set(0, randWall + roofHeight / 2, roofThickness - 1.3);

  house.add(roof1, roof2);

  house.position.copy(position);
  scene.add(house);
  houses.push(house);
  houseCount++;
}

function resetScene() {
  tornadoParts.forEach((part) => scene.remove(part));
  collapsedParts.forEach((part) => scene.remove(part));
  tornadoParts = [];
  collapsedParts = [];

  houses.forEach((h) => {
    if (h.userData.fireParticles) {
      h.userData.fireParticles.forEach((p) => scene.remove(p));
    }
    if (h.userData.fireLight) {
      scene.remove(h.userData.fireLight);
    }
    scene.remove(h);
  });

  houses = [];
  burningHouses = [];
  houseCount = 0;

  tornado.visible = false;
  tornadoActive = false;
  tornado.position.set(-20, 2.5, 0);
  earthquakeActive = false;
  earthquakeTimer = 0;

  createHouse();
}

function collapseHouse(house) {
  const worldPosition = new THREE.Vector3();
  house.getWorldPosition(worldPosition);

  house.children.slice().forEach((part) => {
    const worldPartPosition = new THREE.Vector3();
    part.getWorldPosition(worldPartPosition);

    house.remove(part);
    scene.add(part);
    part.position.copy(worldPartPosition);

    const offset = new THREE.Vector3().subVectors(
      worldPartPosition,
      tornado.position
    );
    const radius = THREE.MathUtils.clamp(offset.length(), 1.0, 4.0);
    const angle = Math.atan2(offset.z, offset.x);

    part.userData = {
      radius,
      angle,
      height: part.position.y,
      angularSpeed: 0.1 + Math.random() * 0.15,
      verticalSpeed: 0.01 + Math.random() * 0.005,
      inTornado: true,
      ejected: false,
    };

    part.userData.velocity = new THREE.Vector3();
    tornadoParts.push(part);
  });
}

createButton("Fire", 340, () => {
  if (houses.length > 0) {
    const target = houses[Math.floor(Math.random() * houses.length)];
    igniteHouse(target);
    burningHouses.push(target);
  }
});

function createButton(text, top, onClick) {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.style.position = "fixed";
  btn.style.top = `${top}px`;
  btn.style.left = "20px";
  btn.style.zIndex = "100";
  btn.style.padding = "10px";
  btn.style.fontSize = "14px";
  document.body.appendChild(btn);
  btn.addEventListener("click", onClick);
}

createButton("Tornado", 20, () => {
  tornadoStage = 1;
  document.body.style.cursor = "crosshair";
});

window.addEventListener("mousedown", (event) => {
  if (tornadoStage === 0) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(floor);
  if (intersects.length === 0) return;

  const point = intersects[0].point;

  if (tornadoStage === 1) {
    tornado.position.set(point.x, 2.5, point.z);
    tornado.visible = true;
    tornadoStage = 2;
  } else if (tornadoStage === 2) {
    tornadoDirection
      .subVectors(point, tornado.position)
      .normalize()
      .multiplyScalar(0.25);
    tornadoActive = true;

    tornadoStage = 0;
    document.body.style.cursor = "default";
  }
});
window.addEventListener("mousedown", (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(floor);
  if (intersects.length === 0) return;

  const point = intersects[0].point;

  if (waitingToPlaceHouse) {
    createHouse(new THREE.Vector3(point.x, 0, point.z));
    waitingToPlaceHouse = false;
    document.body.style.cursor = "default";
    return;
  }
});

createButton("Tsunami", 300, () => {
  tsunamiStage = 1;
  document.body.style.cursor = "crosshair";
});
window.addEventListener("mousedown", (event) => {
  if (tsunamiStage === 0) return;
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(floor);
  if (intersects.length === 0) return;

  const point = intersects[0].point;

  if (tsunamiStage === 1) {
    waveMesh.position.set(point.x, 0.1, point.z);
    waveMesh.visible = true;
    tsunamiStage = 2;
  } else if (tsunamiStage === 2) {
    tsunamiDirection
      .subVectors(point, waveMesh.position)
      .normalize()
      .multiplyScalar(0.3);
    tsunamiActive = true;
    tsunamiStage = 0;
    document.body.style.cursor = "default";
  }
});

createButton("Lightning", 380, () => {
  waitingForLightning = true;
  document.body.style.cursor = "crosshair";
});

window.addEventListener("mousedown", (event) => {
  if (waitingForLightning) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(floor);
    if (intersects.length > 0) {
      const point = intersects[0].point;

      if (lightningBolt) scene.remove(lightningBolt);

      const start = new THREE.Vector3(point.x, 500, point.z);
      const end = new THREE.Vector3(point.x, 0, point.z);
      lightningBolt = createLightningBolt(start, end);
      scene.add(lightningBolt);

      lightningTimer = 10;
      scene.background = new THREE.Color(0xffffff);
      waitingForLightning = false;
      document.body.style.cursor = "default";
      houses.forEach((house) => {
        if (!house.userData.burning && house.position.distanceTo(point) < 5) {
          igniteHouse(house);
          burningHouses.push(house);
        }
      });
    }
    return;
  }
});

const sliderLabel = document.createElement("label");
sliderLabel.textContent = "Earthquake Strength:";
sliderLabel.style.position = "fixed";
sliderLabel.style.top = "220px";
sliderLabel.style.left = "20px";
sliderLabel.style.color = "#000";
sliderLabel.style.zIndex = "100";
document.body.appendChild(sliderLabel);

const strengthSlider = document.createElement("input");
strengthSlider.type = "range";
strengthSlider.min = "0";
strengthSlider.max = "100";
strengthSlider.value = "25";
strengthSlider.style.position = "fixed";
strengthSlider.style.top = "240px";
strengthSlider.style.left = "20px";
strengthSlider.style.zIndex = "100";
document.body.appendChild(strengthSlider);

function createLabeledSlider(labelText, min, max, value, top, onInput) {
  const label = document.createElement("label");
  label.textContent = labelText;
  label.style.position = "fixed";
  label.style.top = `${top}px`;
  label.style.left = "160px";
  label.style.color = "#000";
  label.style.zIndex = "100";
  document.body.appendChild(label);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = min;
  slider.max = max;
  slider.value = value;
  slider.step = "0.1";
  slider.style.position = "fixed";
  slider.style.top = `${top + 20}px`;
  slider.style.left = "160px";
  slider.style.zIndex = "100";
  document.body.appendChild(slider);

  slider.addEventListener("input", (e) => {
    onInput(parseFloat(e.target.value));
  });
}

createLabeledSlider("House Width", 1, 10, houseWidth, 60, (val) => {
  houseWidth = val;
});

createLabeledSlider("House Length", 1, 10, houseLength, 110, (val) => {
  houseLength = val;
});

createLabeledSlider("House Height", 1, 10, houseHeight, 160, (val) => {
  houseHeight = val;
});

createButton("Earthquake", 180, () => {
  earthquakeActive = true;
  earthquakeTimer = 60 * (Math.random() + 2);
});

createButton("Reset", 60, resetScene);

createButton("Make House", 100, () => {
  waitingToPlaceHouse = true;
  document.body.style.cursor = "crosshair";
});

createButton("Remove House", 140, () => {
  if (houses.length > 0) {
    const last = houses.pop();
    scene.remove(last);
    houseCount--;
  }
});

createHouse();

function animate() {
  controls.update();

  if (lightningTimer > 0) {
    lightningTimer--;

    lightningBolt.material.opacity = lightningTimer / 10;

    if (lightningTimer === 0) {
      scene.remove(lightningBolt);
      scene.background = new THREE.Color(0xa9a9a9);
    }
  }

  if (tsunamiActive) {
    tsunamiWater.material.uniforms["time"].value += 1.0 / 60.0;
    tsunamiWater.position.add(tsunamiDirection);

    houses.forEach((house) => {
      if (
        !house.userData.destroyed &&
        tsunamiWater.position.distanceTo(house.position) < 8
      ) {
        house.userData.destroyed = true;
        collapseHouse(house);
      }
    });
  }

  if (earthquakeActive) {
    earthquakeTimer -= 1;
    const strength = parseFloat(strengthSlider.value) / 100;
    houses.forEach((house) => {
      const shakeX = (Math.random() - 0.5) * strength * 1.2;
      const shakeZ = (Math.random() - 0.5) * strength * 1.2;

      house.position.x += shakeX;
      house.position.z += shakeZ;
      house.userData.totalShake =
        (house.userData.totalShake || 0) + Math.abs(shakeX) + Math.abs(shakeZ);
      if (!house.userData.collapsed && house.userData.totalShake > 5) {
        collapseHouse(house);
        house.userData.collapsed = true;
      }
    });
    if (earthquakeTimer <= 0) earthquakeActive = false;
  }

  if (tornadoActive) {
    tornado.rotation.y += 0.2;
    if (tornadoDirection.lengthSq() > 0) {
      tornado.position.add(tornadoDirection);
      tornado.position.y = 3.5;
    }

    houses.forEach((house) => {
      if (
        !house.userData.destroyed &&
        tornado.position.distanceTo(house.position) < 4
      ) {
        house.userData.destroyed = true;
        house.children.slice().forEach((part) => {
          house.remove(part);
          scene.add(part);

          const offset = new THREE.Vector3().subVectors(
            part.position,
            tornado.position
          );
          const radius = Math.max(0.1, offset.length());
          const angle = Math.atan2(offset.z, offset.x);

          part.userData = {
            radius: radius,
            angle: angle,
            height: part.position.y,
            angularSpeed: 0.2 + Math.random() * 0.2,
            verticalSpeed: 0.01 + Math.random() * 0.0001,
            inTornado: true,
            ejected: false,
          };

          tornadoParts.push(part);
        });
      }
    });
  }
  if (waitingForTornadoClick) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(floor);
  }
  if (tsunamiActive) {
    const time = performance.now() * 0.001;
    waveMesh.material.displacementScale = 1.5 + Math.sin(time * 2) * 0.2;
    waveMesh.position.add(tsunamiDirection);

    houses.forEach((house) => {
      if (
        !house.userData.destroyed &&
        waveMesh.position.distanceTo(house.position) < 8
      ) {
        house.userData.destroyed = true;
        collapseHouse(house);
      }
    });
  }
  tornadoParts.forEach((part) => {
    const d = part.userData;

    if (!d.ejected) {
      d.angle += d.angularSpeed;
      d.radius *= 1.001;
      d.height += d.verticalSpeed;

      part.position.x = tornado.position.x + d.radius * Math.cos(d.angle);
      part.position.z = tornado.position.z + d.radius * Math.sin(d.angle);
      part.position.y = d.height;

      if (d.height > 10 || d.radius > 6) {
        d.ejected = true;
        const direction = new THREE.Vector3(
          Math.cos(d.angle),
          0,
          Math.sin(d.angle)
        )
          .normalize()
          .multiplyScalar(0.5);
        d.velocity = direction;
        d.velocity.y = 0.2;
      }

      part.rotation.x += 0.1;
      part.rotation.y += 0.1;
      part.rotation.z += 0.1;
    } else {
      d.velocity.y -= 0.01;
      part.position.add(d.velocity);

      if (part.position.y <= 0) {
        part.position.y = 0;
        if (Math.abs(d.velocity.y) > 0.1) d.velocity.y *= -0.4;
        else d.velocity.set(0, 0, 0);
      }
    }
  });

  for (let i = collapsedParts.length - 1; i >= 0; i--) {
    const part = collapsedParts[i];
    if (!part.userData.isFromHouse) continue;

    const distance = part.position.distanceTo(tornado.position);

    if (distance < 4 && !part.userData.inTornado) {
      collapsedParts.splice(i, 1);

      const offset = new THREE.Vector3().subVectors(
        part.position,
        tornado.position
      );
      const radius = THREE.MathUtils.clamp(offset.length(), 1.0, 4.0);
      const angle = Math.atan2(offset.z, offset.x);

      part.userData = {
        radius,
        angle,
        height: part.position.y,
        angularSpeed: 0.2 + Math.random() * 0.2,
        verticalSpeed: 0.01 + Math.random() * 0.0001,
        inTornado: true,
      };

      tornadoParts.push(part);
    }
  }

  collapsedParts.forEach((part) => {
    const d = part.userData;
    if (!d.velocity) return;
    d.velocity.y -= 0.01;
    part.position.add(d.velocity);

    if (part.position.y <= 0) {
      part.position.y = 0;
      d.velocity.set(0, 0, 0);
    } else {
      if (d.rotationVelocity) {
        part.rotation.x += d.rotationVelocity.x;
        part.rotation.y += d.rotationVelocity.y;
        part.rotation.z += d.rotationVelocity.z;
      }
    }
  });
  updateFires();
  renderer.render(scene, camera);
}
