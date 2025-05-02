/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Text } from 'troika-three-text';
import { XR_BUTTONS } from 'gamepad-wrapper';
import { gsap } from 'gsap';
import { init } from './init.js';

const bullets = {};
const forwardVector = new THREE.Vector3(0, 0, -1);
const bulletSpeed = 10;
const bulletTimeToLive = 1;

const rightHandGroup = new THREE.Group();
const leftHandGroup = new THREE.Group();
const targets = [];

let score = 0;
const scoreText = new Text();
scoreText.fontSize = 0.52;
scoreText.font = 'assets/SpaceMono-Bold.ttf';
scoreText.position.z = -2;
scoreText.color = 0xffa276;
scoreText.anchorX = 'center';
scoreText.anchorY = 'middle';

let laserSound, leftLaserSound, scoreSound;
let rightHandOpenMesh = null;
let rightHandFistMesh = null;
let rightHandIsFist = false;
let leftHandOpenMesh = null;
let leftHandFistMesh = null;
let leftHandIsFist = false;

let soundtrack = null;

function updateScoreDisplay() {
	const clampedScore = Math.max(0, Math.min(9999, score));
	const displayScore = clampedScore.toString().padStart(4, '0');
	scoreText.text = displayScore;
	scoreText.sync();
}

function setupScene({ scene, camera, renderer, player, controllers }) {
	scene.background = new THREE.Color(0x87CEEB);
	const gltfLoader = new GLTFLoader();

	gltfLoader.load('assets/football_court.glb', (gltf) => {
		gltf.scene.position.y = 0;
		gltf.scene.scale.set(6, 6, 6);
		scene.add(gltf.scene);
	});

	gltfLoader.load('assets/gorilla_hand.glb', (gltf) => {
		gltf.scene.scale.set(0.33, 0.33, 0.33);
		gltf.scene.scale.x *= -1;
		gltf.scene.rotation.y = -Math.PI / 2;
		gltf.scene.rotation.x = -Math.PI / 2;
		rightHandOpenMesh = gltf.scene;
		rightHandGroup.add(rightHandOpenMesh);
	});

	gltfLoader.load('assets/fist.glb', (gltf) => {
		gltf.scene.scale.set(0.33, 0.33, 0.33);
		gltf.scene.scale.x *= -1;
		gltf.scene.rotation.y = -Math.PI / 2;
		gltf.scene.rotation.x = -Math.PI / 2;
		rightHandFistMesh = gltf.scene;
	});

	gltfLoader.load('assets/gorilla_hand.glb', (gltf) => {
		gltf.scene.scale.set(0.33, 0.33, 0.33);
		gltf.scene.rotation.y = Math.PI / 2;
		gltf.scene.rotation.x = -Math.PI / 2;
		leftHandOpenMesh = gltf.scene;
		leftHandGroup.add(leftHandOpenMesh);
	});

	gltfLoader.load('assets/fist.glb', (gltf) => {
		gltf.scene.scale.set(0.33, 0.33, 0.33);
		gltf.scene.rotation.y = Math.PI / 2;
		gltf.scene.rotation.x = -Math.PI / 2;
		leftHandFistMesh = gltf.scene;
	});

	gltfLoader.load('assets/target.glb', (gltf) => {
		for (let i = 0; i < 3; i++) {
			const target = gltf.scene.clone();
			target.position.set(
				Math.random() * 10 - 5,
				i * 2 + 1,
				-Math.random() * 5 - 5,
			);
			scene.add(target);
			targets.push(target);
		}
	});

	scene.add(scoreText);
	scoreText.position.set(0, 0.67, -1.44);
	scoreText.rotateX(-Math.PI / 3.3);
	updateScoreDisplay();

	// Load and set up positional audio
	const listener = new THREE.AudioListener();
	camera.add(listener);

	const audioLoader = new THREE.AudioLoader();
	
	// Right controller laser sound
	laserSound = new THREE.PositionalAudio(listener);
	audioLoader.load('assets/laser.ogg', (buffer) => {
		laserSound.setBuffer(buffer);
		rightHandGroup.add(laserSound);
	});

	// Left controller laser sound
	leftLaserSound = new THREE.PositionalAudio(listener);
	audioLoader.load('assets/laser.ogg', (buffer) => {
		leftLaserSound.setBuffer(buffer);
		leftHandGroup.add(leftLaserSound);
	});

	scoreSound = new THREE.PositionalAudio(listener);
	audioLoader.load('assets/score.ogg', (buffer) => {
		scoreSound.setBuffer(buffer);
		scoreText.add(scoreSound);
	});

	audioLoader.load('assets/soundtrack.mp3', (buffer) => {
		soundtrack = new THREE.Audio(listener);
		soundtrack.setBuffer(buffer);
		soundtrack.loop = true;
		soundtrack.play();
	});
}

function onFrame(
	delta,
	time,
	{ scene, camera, renderer, player, controllers },
) {
	// Handle right controller
	if (controllers.right) {
		const { gamepad, raySpace, mesh } = controllers.right;
		if (!raySpace.children.includes(rightHandGroup)) {
			raySpace.add(rightHandGroup);
			mesh.visible = false;
		}

		// Swap to fist on trigger press, open on release
		if (gamepad.getButtonValue(XR_BUTTONS.TRIGGER) > 0.5) {
			if (!rightHandIsFist && rightHandFistMesh && rightHandOpenMesh) {
				rightHandGroup.remove(rightHandOpenMesh);
				rightHandGroup.add(rightHandFistMesh);
				rightHandIsFist = true;
			}
		} else {
			if (rightHandIsFist && rightHandFistMesh && rightHandOpenMesh) {
				rightHandGroup.remove(rightHandFistMesh);
				rightHandGroup.add(rightHandOpenMesh);
				rightHandIsFist = false;
			}
		}
	}

	// Handle left controller
	if (controllers.left) {
		const { gamepad, raySpace, mesh } = controllers.left;
		if (!raySpace.children.includes(leftHandGroup)) {
			raySpace.add(leftHandGroup);
			mesh.visible = false;
		}

		// Swap to fist on trigger press, open on release
		if (gamepad.getButtonValue(XR_BUTTONS.TRIGGER) > 0.5) {
			if (!leftHandIsFist && leftHandFistMesh && leftHandOpenMesh) {
				leftHandGroup.remove(leftHandOpenMesh);
				leftHandGroup.add(leftHandFistMesh);
				leftHandIsFist = true;
			}
		} else {
			if (leftHandIsFist && leftHandFistMesh && leftHandOpenMesh) {
				leftHandGroup.remove(leftHandFistMesh);
				leftHandGroup.add(leftHandOpenMesh);
				leftHandIsFist = false;
			}
		}

		if (gamepad.getButtonClick(XR_BUTTONS.TRIGGER)) {
			try {
				gamepad.getHapticActuator(0).pulse(0.6, 100);
			} catch {
				// do nothing
			}
		}
	}
}

init(setupScene, onFrame);