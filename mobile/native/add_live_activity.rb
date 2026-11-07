# Adds DeVig's lock-screen cards to the generated iPhone project (run by .github/workflows/devig_apps.yml after
# `npx cap add ios`, from mobile/): the plugin files go in the App target, and a new widget extension "DeVigLive"
# draws the cards. The native files are copied into ios/App/App and ios/App/DeVigLive before this runs.
require 'xcodeproj'

path = 'ios/App/App.xcodeproj'
project = Xcodeproj::Project.open(path)
app = project.targets.find { |t| t.name == 'App' } or abort('no App target')

app_group = project.main_group['App'] or abort('no App group')
shared = nil
%w[DeVigLiveAttributes.swift DeVigLivePlugin.swift DeVigKalshiPlugin.swift DeVigViewController.swift].each do |f|
  ref = app_group.files.find { |x| x.path == f } || app_group.new_reference(f)
  app.source_build_phase.add_file_reference(ref, true)
  shared = ref if f == 'DeVigLiveAttributes.swift'
end

ext = project.new_target(:app_extension, 'DeVigLive', :ios, '16.2', nil, :swift)
group = project.main_group.new_group('DeVigLive', 'DeVigLive')
ext.source_build_phase.add_file_reference(group.new_reference('DeVigLiveWidget.swift'), true)
ext.source_build_phase.add_file_reference(shared, true) # the card's data shape is shared with the app
group.new_reference('Info.plist')

app_conf = app.build_configurations.first.build_settings
ext.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'dev.pages.devigai.app.live'
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['INFOPLIST_FILE'] = 'DeVigLive/Info.plist'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['SWIFT_VERSION'] = '5.0'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '16.2'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['SKIP_INSTALL'] = 'YES'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  s['MARKETING_VERSION'] = app_conf['MARKETING_VERSION'] || '1.0'
  s['CURRENT_PROJECT_VERSION'] = app_conf['CURRENT_PROJECT_VERSION'] || '1'
  s['CODE_SIGNING_ALLOWED'] = 'NO'
  s['CODE_SIGN_STYLE'] = 'Manual'
  s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
end
%w[WidgetKit SwiftUI ActivityKit].each do |fw|
  ext.frameworks_build_phase.add_file_reference(project.frameworks_group.new_file("System/Library/Frameworks/#{fw}.framework", :sdk_root), true)
end

# the app carries the extension inside it (PlugIns/DeVigLive.appex)
app.add_dependency(ext)
embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
bf = embed.add_file_reference(ext.product_reference, true)
bf.settings = { 'ATTRIBUTES' => ['RemoveHeaderFiles'] }

# the app still runs on older iOS: ActivityKit is linked weakly and only used behind availability checks
app.build_configurations.each do |c|
  flags = Array(c.build_settings['OTHER_LDFLAGS'] || ['$(inherited)'])
  c.build_settings['OTHER_LDFLAGS'] = flags + ['-weak_framework', 'ActivityKit']
end

project.save
puts 'Added the DeVigLive lock-screen extension'
