// App.js
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import OnboardingScreen from './screens/OnboardingScreen';
import FeedScreen from './screens/FeedScreen';
import { supabase } from './supabase';

const Stack = createStackNavigator();

export default function App() {
    const [isOnboarded, setIsOnboarded] = useState(null);

    useEffect(() => {
        const setupUser = async () => {
            console.log("App.js: setupUser started");
            try {
                console.log("App.js: Getting USER_ID from AsyncStorage...");
                let userId = await AsyncStorage.getItem('USER_ID');
                console.log("App.js: USER_ID from AsyncStorage:", userId);
                if (!userId) {
                    console.log("App.js: USER_ID not found, generating new one...");
                    userId = await Crypto.randomUUID();
                    console.log("App.js: Generated new USER_ID:", userId);
                    await AsyncStorage.setItem('USER_ID', userId);
                    console.log("App.js: Saved new USER_ID to AsyncStorage");
                    // Insert user into Supabase
                    console.log("App.js: Inserting user into Supabase...");
                    await supabase.from('users').insert({ 
                        id: userId, 
                        email: `${userId}@temp.com` 
                    });
                    console.log("App.js: User inserted into Supabase");
                }
                global.userId = userId;

                console.log("App.js: Getting ONBOARDED from AsyncStorage...");
                const onboarded = await AsyncStorage.getItem('ONBOARDED');
                console.log("App.js: ONBOARDED from AsyncStorage:", onboarded);
                setIsOnboarded(onboarded === 'true');
                console.log("App.js: setIsOnboarded called with:", onboarded === 'true');
            } catch (error) {
                console.error('App.js: Error setting up user:', error);
                setIsOnboarded(false); // Default to onboarding on error
                console.log("App.js: setIsOnboarded called with: false (due to error)");
            } finally {
                console.log("App.js: setupUser finished");
            }
        };
        setupUser();
    }, []);

    if (isOnboarded === null) {
        return null; // Show nothing while loading
    }

    return (
        <NavigationContainer>
            <Stack.Navigator
                initialRouteName={isOnboarded ? 'Feed' : 'Onboarding'}
                screenOptions={{ headerShown: false }}
            >
                <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                <Stack.Screen name="Feed" component={FeedScreen} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}