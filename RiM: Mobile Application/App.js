import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Button, TextInput, PermissionsAndroid, Alert, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { accelerometer } from 'react-native-sensors';
import BackgroundService from 'react-native-background-actions';
import RNFS from 'react-native-fs';
import Share from 'react-native-share'; // Using react-native-share for FileProvider support
import * as Notifications from 'expo-notifications'; // NEW: Import Expo Notifications
import * as Linking from 'expo-linking';

export default function App() {
  // Screen state: 1 = Welcome, 2 = User Details, 3 = Daily Activity
  const [screen, setScreen] = useState(1);

  // Health tracking states
  const [stepCount, setStepCount] = useState(0);
  const [distance, setDistance] = useState(0);
  const [sleepHours, setSleepHours] = useState(0);
  const [lastActivityTime, setLastActivityTime] = useState(new Date());
  const [isSleeping, setIsSleeping] = useState(false);

  // User details states (screen 2)
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  // Removed rollNumber state
  const [email, setEmail] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [gender, setGender] = useState('Male');

  // New meal state variables (default "No")
  const [breakfast, setBreakfast] = useState("No");
  const [lunch, setLunch] = useState("No");
  const [dinner, setDinner] = useState("No");

  const STEP_THRESHOLD = 1.8; // sensitivity threshold for step detection
  const STRIDE_LENGTH = 0.50; // average stride length in meters

  // ------------- NEW: Use a ref to hold the latest values -------------
  const latestDataRef = useRef({
    stepCount: 0,
    distance: 0,
    sleepHours: 0,
    breakfast: "No",
    lunch: "No",
    dinner: "No",
    age: "",
    height: "",
    weight: "",
    gender: "Male"
  });

  // NEW: Ref to store user details (age, height, weight, gender) just once
  const initialUserDataRef = useRef(null);

  // Update ref when these state values change (except the ones we want to keep constant)
  useEffect(() => {
    latestDataRef.current = { 
      stepCount, 
      distance, 
      sleepHours, 
      breakfast, 
      lunch, 
      dinner, 
      age, 
      height, 
      weight,
      gender
    };
  }, [stepCount, distance, sleepHours, breakfast, lunch, dinner, age, height, weight, gender]);

  // ----------------- Existing methods -----------------

  // Save health data to local storage so that it persists across app restarts
  const saveHealthData = async (data) => {
    try {
      await AsyncStorage.setItem('healthData', JSON.stringify(data));
    } catch (error) {
      console.error('Error saving health data:', error);
    }
  };

  // Load persisted health data
  const loadHealthData = async () => {
    try {
      const storedHealthData = await AsyncStorage.getItem('healthData');
      if (storedHealthData) {
        const data = JSON.parse(storedHealthData);
        setStepCount(data.stepCount || 0);
        setDistance(data.distance || 0);
        setSleepHours(data.sleepHours || 0);
        setLastActivityTime(data.lastActivityTime ? new Date(data.lastActivityTime) : new Date());
      }
    } catch (error) {
      console.error("Error reading health data:", error);
    }
  };

  // ------------- NEW: Load persisted meal data -------------
  const loadMealData = async () => {
    try {
      const storedMealData = await AsyncStorage.getItem('mealData');
      if (storedMealData) {
        const data = JSON.parse(storedMealData);
        setBreakfast(data.breakfast || "No");
        setLunch(data.lunch || "No");
        setDinner(data.dinner || "No");
      }
    } catch (error) {
      console.error("Error reading meal data:", error);
    }
  };

  // ------------- NEW: Save meal data whenever it changes -------------
  const saveMealData = async (data) => {
    try {
      await AsyncStorage.setItem('mealData', JSON.stringify(data));
    } catch (error) {
      console.error('Error saving meal data:', error);
    }
  };

  // ------------- NEW: Handle Save Meal button press -------------
  const handleMealSave = async () => {
    try {
      await saveMealData({ breakfast, lunch, dinner });
      Alert.alert('Success', 'Meal data saved successfully.');
    } catch (error) {
      console.error('Error saving meal data:', error);
      Alert.alert('Error', 'An error occurred while saving meal data.');
    }
  };

  // ------------- NEW: Function to reset meal data at midnight -------------
  const resetMealData = async () => {
    setBreakfast("No");
    setLunch("No");
    setDinner("No");
    await AsyncStorage.setItem('mealData', JSON.stringify({ breakfast: "No", lunch: "No", dinner: "No" }));
  };

  // ------------- Modify: Check for stored user data and load details -------------
  const checkStoredUserData = async () => {
    try {
      const storedData = await AsyncStorage.getItem('userData');
      if (storedData) {
        const user = JSON.parse(storedData);
        setName(user.name || '');
        setAge(user.age || '');
        // Removed rollNumber loading
        setEmail(user.email || '');
        setHeight(user.height || '');
        setWeight(user.weight || '');
        setGender(user.gender || 'Male');
        // Save these details just once in a ref for CSV purposes
        initialUserDataRef.current = { age: user.age, height: user.height, weight: user.weight, gender: user.gender };
        setScreen(3);
      }
    } catch (error) {
      console.error("Error reading user data:", error);
    }
  };

  // Request necessary permissions
  const requestPermissions = async () => {
    try {
      await AsyncStorage.setItem('dummy', 'dummy'); // Dummy async call to simulate permission request
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION);
    } catch (error) {
      console.error('Permission error:', error);
    }
  };

  // ----------------- NEW: Setup Push Notification for Meal Reminder -----------------
  useEffect(() => {
    // Request notification permissions
    const registerForPushNotificationsAsync = async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission not granted for notifications!');
        return;
      }
    };

    registerForPushNotificationsAsync();

    // Set notification handler so that notifications are shown even when the app is in the foreground
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    // Note: We removed the direct scheduling here to avoid triggering on install.
  }, []);
  // ----------------- End Push Notification Setup -----------------

  useEffect(() => {
    checkStoredUserData();
    loadHealthData();
    loadMealData(); // NEW: Load meal choices on startup
    requestPermissions();
    startStepCounter();
    startBackgroundService();
  }, []);

  // Save health data whenever it changes
  useEffect(() => {
    saveHealthData({ stepCount, distance, sleepHours, lastActivityTime });
  }, [stepCount, distance, sleepHours, lastActivityTime]);

  // Subscribe to the accelerometer to detect steps with debounce
  const startStepCounter = () => {
    let lastMagnitude = 0;
    let lastStepTime = 0; // Timestamp of the last detected step in milliseconds
    accelerometer.subscribe(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();
      if (Math.abs(magnitude - lastMagnitude) > STEP_THRESHOLD && (now - lastStepTime > 300)) {
        lastStepTime = now;
        setStepCount(prev => prev + 1);
        setDistance(prev => prev + STRIDE_LENGTH);
        setLastActivityTime(new Date());

        // When the user is detected moving in the morning and was sleeping, add 2 hours to sleep that is lost while monitoring inactivity
        const currentTime = new Date();
        if (isSleeping && currentTime.getHours() >= 0 && currentTime.getHours() < 10) {
          setSleepHours(prev => prev + 2);
          setIsSleeping(false);
        }
      }
      lastMagnitude = magnitude;
    });
  };

  // Check for sleep conditions based on inactivity and time of day
  const trackSleep = () => {
    const now = new Date();
    // Check if it's in sleep time window (10 PM - 10 AM)
    if (now.getHours() >= 22 || now.getHours() < 10) {
      const timeSinceLastActivity = (now - lastActivityTime) / (1000 * 60); // minutes
      if (timeSinceLastActivity > 120) { // inactivity for more than 2 hours
        if (!isSleeping) {
          setIsSleeping(true);
        }
        setSleepHours(prev => prev + 1 / 60);
      } else {
        if (isSleeping) setIsSleeping(false);
      }
    }
  };

  // Helper function to store or update the day's data in a CSV file
  const storeDataToCSV = async () => {
    try {
      // Save CSV to DocumentDirectoryPath (internal storage)
      const filePath = RNFS.DocumentDirectoryPath + '/healthData.csv';
      const today = new Date().toISOString().split('T')[0];

      // Use the latest data from the ref
      const {
        stepCount,
        distance,
        sleepHours,
        breakfast,
        lunch,
        dinner,
      } = latestDataRef.current;

      // Use the initial user data (age, height, weight, gender) saved just once, fallback if not set
      let userAge, userHeight, userWeight, userGender;
      if (initialUserDataRef.current) {
        userAge = initialUserDataRef.current.age;
        userHeight = initialUserDataRef.current.height;
        userWeight = initialUserDataRef.current.weight;
        userGender = initialUserDataRef.current.gender;
      } else {
        userAge = latestDataRef.current.age;
        userHeight = latestDataRef.current.height;
        userWeight = latestDataRef.current.weight;
        userGender = latestDataRef.current.gender;
      }

      // Convert meal choices to binary (Yes: 1, No: 0)
      const breakfastBinary = breakfast === 'Yes' ? 1 : 0;
      const lunchBinary = lunch === 'Yes' ? 1 : 0;
      const dinnerBinary = dinner === 'Yes' ? 1 : 0;

      // Convert distance from meters to kms and format to 2 decimals
      const distanceInKms = (distance / 1000).toFixed(2);

      // Convert gender to binary (Male: 1, Female: 0)
      const genderBinary = userGender === 'Male' ? 1 : 0;

      const newRow = `${today},${stepCount},${distanceInKms},${sleepHours.toFixed(2)},${breakfastBinary},${lunchBinary},${dinnerBinary},${userAge},${userHeight},${userWeight},${genderBinary}`;
      const fileExists = await RNFS.exists(filePath);
      if (!fileExists) {
        const header = 'date,steps,distance,sleep,breakfast,lunch,dinner,age,height,weight,gender\n';
        await RNFS.writeFile(filePath, header + newRow + "\n", 'utf8');
      } else {
        let content = await RNFS.readFile(filePath, 'utf8');
        let lines = content.trim().split('\n');
        let updated = false;
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].startsWith(today + ',')) {
            lines[i] = newRow;
            updated = true;
            break;
          }
        }
        if (!updated) {
          lines.push(newRow);
        }
        const updatedContent = lines.join('\n') + "\n";
        await RNFS.writeFile(filePath, updatedContent, 'utf8');
      }
    } catch (error) {
      console.error('Error storing data to CSV:', error);
    }
  };

  // ----------------- Start Background Service -----------------
  // Background service now handles sleep tracking, CSV updates daily at 23:55,
  // resets meal entries, sleep hours, step count, and distance automatically at midnight,
  // and now also triggers a meal reminder notification at 21:45.
  const startBackgroundService = async () => {
    const sleepAndCSVUpdateTask = async () => {
      let lastCSVUpdateDate = null;
      let lastResetDate = null;
      let lastMealNotificationDate = null; // NEW: To ensure notification triggers only once per day
      while (true) {
        await new Promise(resolve => setTimeout(resolve, 60000)); // wait 1 minute
        trackSleep();

        const now = new Date();
        // Check if current time is 23:55 and CSV hasn't been updated today
        if (
          now.getHours() === 23 &&
          now.getMinutes() === 55 &&
          (!lastCSVUpdateDate || lastCSVUpdateDate.toDateString() !== now.toDateString())
        ) {
          await storeDataToCSV();
          lastCSVUpdateDate = now;
        }
        // Check if it's midnight and data hasn't been reset today
        if (
          now.getHours() === 0 &&
          now.getMinutes() === 0 &&
          (!lastResetDate || lastResetDate.toDateString() !== now.toDateString())
        ) {
          await resetMealData();
          setSleepHours(0); // Reset sleep hours at midnight
          setStepCount(0);  // Reset step count at midnight
          setDistance(0);   // Reset distance at midnight
          lastResetDate = now;
        }
        // NEW: Check if it's 21:45 for meal reminder notification
        if (
          now.getHours() === 21 &&
          now.getMinutes() === 45 &&
          (!lastMealNotificationDate || lastMealNotificationDate.toDateString() !== now.toDateString())
        ) {
          await Notifications.presentNotificationAsync({
            title: "Meal Reminder",
            body: "Please enter your meal data in the app.",
            sound: true,
          });
          lastMealNotificationDate = now;
        }
      }
    };
    await BackgroundService.start(sleepAndCSVUpdateTask, {
      taskName: 'HealthTracker',
      taskTitle: 'Tracking Steps & Sleep',
      taskDesc: 'Recording activity data in the background.',
      taskIcon: { name: 'ic_launcher', type: 'mipmap' },
      link: 'riM://openapp', // Added link property so tapping the notification opens the app (or does nothing)
      notificationHidden: true,
      parameters: {},
      stopWithApp: false,
    });
  };

  // Handle submission of user data from screen 2
  const handleUserDataSubmit = async () => {
    const userData = { name, age, email, height, weight, gender }; // Removed rollNumber from userData
    try {
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
      // Save the initial user data if not already saved
      if (!initialUserDataRef.current) {
        initialUserDataRef.current = { age, height, weight, gender };
      }
      setScreen(3);
    } catch (error) {
      console.error("Error saving user data:", error);
    }
  };

  // Download CSV using react-native-share (FileProvider is used internally via native config)
  // Now, before sharing, update the CSV with current data
  const downloadCSV = async () => {
    try {
      await storeDataToCSV();
      const filePath = RNFS.DocumentDirectoryPath + '/healthData.csv';
      const exists = await RNFS.exists(filePath);
      if (!exists) {
        Alert.alert('No CSV file found.');
        return;
      }
      const shareOptions = {
        title: 'Health Data CSV',
        message: 'Please find your health data CSV file attached.',
        url: 'file://' + filePath, // This will be converted by the FileProvider
      };
      await Share.open(shareOptions);
    } catch (error) {
      console.error('Error downloading CSV:', error);
      Alert.alert('Error', 'An error occurred while trying to download the CSV file.');
    }
  };

  // ----------------- Render Screens -----------------

  if (screen === 1) {
    return (
      <View style={styles.container}>
        <Image 
          source={require('./welcome.png')} 
          style={styles.welcomeImage} 
          resizeMode="contain" 
        />
        <Text style={styles.title}>Hello there! My name is RiM.</Text>
        <Text style={styles.description}>
          I am here to assess your physical well-being based on your lifestyle habits.
        </Text>
        <Button title="Continue" onPress={() => setScreen(2)} />
      </View>
    );
  }
  if (screen === 2) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Enter Your Details</Text>
        <TextInput placeholder="Name" style={styles.input} value={name} onChangeText={setName} />
        <TextInput placeholder="Age" style={styles.input} value={age} onChangeText={setAge} keyboardType="numeric" />
        {/* Removed Roll Number input */}
        <TextInput placeholder="Email" style={styles.input} value={email} onChangeText={setEmail} />
        <TextInput placeholder="Height (cm)" style={styles.input} value={height} onChangeText={setHeight} keyboardType="numeric" />
        <TextInput placeholder="Weight (kg)" style={styles.input} value={weight} onChangeText={setWeight} keyboardType="numeric" />
        <Text style={{ marginTop: 10 }}>Gender</Text>
        <Picker selectedValue={gender} style={{ height: 50, width: 150 }} onValueChange={(itemValue) => setGender(itemValue)}>
          <Picker.Item label="Male" value="Male" />
          <Picker.Item label="Female" value="Female" />
        </Picker>
        <Button title="Continue" onPress={handleUserDataSubmit} />
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Daily Activity</Text>
      <Text style={styles.dataText}>Steps Today: {stepCount}</Text>
      <Text style={styles.dataText}>Distance Travelled: {(distance / 1000).toFixed(2)} Kms</Text>
      <Text style={styles.dataText}>Sleep Hours: {sleepHours.toFixed(2)}</Text>
      <Text style={styles.dataText}>Breakfast</Text>
      <Picker selectedValue={breakfast} style={{ height: 50, width: 150 }} onValueChange={(itemValue) => setBreakfast(itemValue)}>
        <Picker.Item label="No" value="No" />
        <Picker.Item label="Yes" value="Yes" />
      </Picker>
      <Text style={styles.dataText}>Lunch</Text>
      <Picker selectedValue={lunch} style={{ height: 50, width: 150 }} onValueChange={(itemValue) => setLunch(itemValue)}>
        <Picker.Item label="No" value="No" />
        <Picker.Item label="Yes" value="Yes" />
      </Picker>
      <Text style={styles.dataText}>Dinner</Text>
      <Picker selectedValue={dinner} style={{ height: 50, width: 150 }} onValueChange={(itemValue) => setDinner(itemValue)}>
        <Picker.Item label="No" value="No" />
        <Picker.Item label="Yes" value="Yes" />
      </Picker>
      <Button title="Save Meal" onPress={handleMealSave} />
      <View style={{ marginVertical: 10 }} />
      <Button title="Download CSV" onPress={downloadCSV} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  description: { fontSize: 16, marginBottom: 20, textAlign: 'center', paddingHorizontal: 20 },
  input: { width: '80%', height: 40, borderWidth: 1, marginBottom: 10, padding: 8, borderRadius: 5 },
  dataText: { fontSize: 18, marginBottom: 10 },
  welcomeImage: { 
    width: 200, 
    height: 200, 
    marginBottom: 20,
    borderRadius: 100, // Makes the image container circular
  }
});
