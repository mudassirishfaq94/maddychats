import test from "node:test";
import assert from "node:assert/strict";
import { Capacitor } from "@capacitor/core";
import { hasCapacitorRuntime, isNativeApp } from "../src/lib/native-platform";

test("hosted Android receives native behavior without requesting unavailable Capacitor plugins", () => {
  const originalWindow=Object.getOwnPropertyDescriptor(globalThis,"window"),originalNavigator=Object.getOwnPropertyDescriptor(globalThis,"navigator");
  const originalCheck=Capacitor.isNativePlatform;
  try {
    Object.defineProperty(globalThis,"window",{configurable:true,value:{}});
    Object.defineProperty(globalThis,"navigator",{configurable:true,value:{userAgent:"Android WebView ZipTalkAndroid/0.8"}});
    Capacitor.isNativePlatform=()=>false;
    assert.equal(isNativeApp(),true);assert.equal(hasCapacitorRuntime(),false);
    Object.defineProperty(globalThis,"navigator",{configurable:true,value:{userAgent:"Ordinary web browser"}});
    assert.equal(isNativeApp(),false);assert.equal(hasCapacitorRuntime(),false);
    Capacitor.isNativePlatform=()=>true;
    assert.equal(isNativeApp(),true);assert.equal(hasCapacitorRuntime(),true);
    Reflect.deleteProperty(globalThis,"window");assert.equal(hasCapacitorRuntime(),false);
  } finally {
    Capacitor.isNativePlatform=originalCheck;
    if(originalWindow)Object.defineProperty(globalThis,"window",originalWindow);else Reflect.deleteProperty(globalThis,"window");
    if(originalNavigator)Object.defineProperty(globalThis,"navigator",originalNavigator);else Reflect.deleteProperty(globalThis,"navigator");
  }
});
