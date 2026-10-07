/**
 * Quote the path in Xcode's "Bundle React Native code and images" phase.
 *
 * Prebuild writes that phase's last line as
 *
 *   `"$NODE_BINARY" --print "…/scripts/react-native-xcode.sh"`
 *
 * — backticks, so the printed path is word-split before it runs. This app
 * lives in "Stay Partner", so EAS builds it at
 * /Users/expo/workingdir/build/Stay Partner and the archive dies with
 * "/Users/expo/workingdir/build/Stay: No such file or directory" — the same
 * failure the User App hit. "$(…)" runs the same path as one word.
 *
 * The other half of the same problem is in patches/expo-constants+*.patch.
 */
const { withXcodeProject } = require('expo/config-plugins');

const PHASE_NAME = 'Bundle React Native code and images';
const UNQUOTED = /`(\\"\$NODE_BINARY\\" --print [^`]*?react-native-xcode\.sh'\\")`/;

module.exports = function withQuotedBundleScript(config) {
  return withXcodeProject(config, (cfg) => {
    const phases = cfg.modResults.hash.project.objects.PBXShellScriptBuildPhase || {};
    for (const phase of Object.values(phases)) {
      if (typeof phase !== 'object' || !phase.name || !phase.name.includes(PHASE_NAME)) continue;
      if (UNQUOTED.test(phase.shellScript)) {
        phase.shellScript = phase.shellScript.replace(UNQUOTED, '\\"$($1)\\"');
      }
    }
    return cfg;
  });
};
