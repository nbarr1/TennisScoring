module.exports = function (api) {
  api.cache(true);
  return {
    // Pin the Hermes transform profile to hermes-v0.
    //
    // babel-preset-expo 57 defaults this to 'hermes-stable' whenever the engine
    // is Hermes, which selects its `hermes-v1` engine preset. That preset
    // deliberately omits the class-properties, private-methods and
    // private-property-in-object transforms because it assumes a Hermes V1
    // runtime that parses those natively.
    //
    // This app does not have one. react-native 0.83.1 pins
    // hermes-compiler 0.14.0 and ships no sdks/hermesc, so with
    // hermesEnabled=true the Gradle release build invokes that v0-era compiler,
    // which rejects ES private class fields ("private properties are not
    // supported"). React Native's own core DOMRect uses them, so the Android
    // release bundle fails to compile to bytecode and every EAS build dies at
    // that step. The `hermes-v0` preset keeps the three transforms, which is
    // what this Hermes version needs.
    //
    // Revisit when react-native ships a Hermes V1 compiler; until then this must
    // stay in sync with whatever hermes-compiler react-native depends on.
    presets: [['babel-preset-expo', { unstable_transformProfile: 'hermes-v0' }]],
  };
};
